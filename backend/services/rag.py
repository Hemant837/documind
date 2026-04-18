"""
Updated for per-user document scoping.

What changed:
  - process_document() accepts user_id, stores it in ChromaDB metadata
  - list_documents() filters by user_id
  - delete_document() verifies ownership before deleting
  - ask_question / ask_question_stream pass user_id to history and
    add it to the ChromaDB filter so users only search their own docs
"""

import json
import os
import uuid
from threading import Lock
from typing import AsyncGenerator

import chromadb
from chromadb.config import Settings
from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

import services.history as history
from services.titles import generate_title

load_dotenv()

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
TOP_K = 10
MAX_SOURCES = 4
MIN_SOURCES = 3
HISTORY_TURNS = 10

CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8001"))
CHROMA_API_KEY = os.getenv("CHROMA_API_KEY", "")       # set in production → uses Chroma Cloud
CHROMA_TENANT = os.getenv("CHROMA_TENANT", "")
CHROMA_DATABASE = os.getenv("CHROMA_DATABASE", "default_database")
CHROMA_COLLECTION = "documents"


class NoDocumentsError(Exception):
    pass

class NoContentFoundError(Exception):
    pass


_embeddings = OpenAIEmbeddings()
_llm = ChatOpenAI(model="gpt-4o-mini", streaming=True)
_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
)

SYSTEM_PROMPT = """\
You are a precise document assistant. Follow these rules strictly:

1. GROUNDING: Answer using ONLY the information in the provided context chunks.
   Never use outside knowledge or make assumptions beyond what is written.

2. SYNTHESIS: If the answer requires combining information from multiple sources,
   do so explicitly. State which parts came from which source.

3. CITATIONS: When making a claim, reference the source inline like this:
   "According to [filename, page N], ..." or "As stated in [filename], ..."

4. FOLLOW-UPS: Use the conversation history to resolve follow-up questions.

5. HONESTY: If the context contains no relevant information, say exactly:
   "I could not find the answer in the provided documents."

6. FORMAT: Use markdown. Use bullet points for lists, bold for key terms,
   and code blocks for any technical content.
"""


def _build_where_filter(
    user_id: str,
    doc_ids: list[str] | None,
) -> dict:
    """
    Build a ChromaDB where filter that always scopes to user_id,
    optionally further filtered by specific doc_ids.

    ChromaDB's $and operator combines multiple conditions.
    """
    user_filter = {"user_id": {"$eq": user_id}}

    if not doc_ids:
        return user_filter

    doc_filter = (
        {"doc_id": {"$eq": doc_ids[0]}}
        if len(doc_ids) == 1
        else {"doc_id": {"$in": doc_ids}}
    )

    # Combine user scope + doc scope with $and
    return {"$and": [user_filter, doc_filter]}


def _dedupe_sources(metas: list[dict]) -> list[dict]:
    seen = set()
    sources = []
    for m in metas:
        key = (m.get("file_name"), m.get("page"))
        if key not in seen:
            seen.add(key)
            sources.append({"file_name": m.get("file_name"), "page": m.get("page")})
    return sources


async def _build_retrieval_inputs(
    query: str,
    session_id: str,
    doc_ids: list[str] | None,
    user_id: str,
    collection,
    db: AsyncSession,
) -> tuple[str, list[dict]]:
    """Shared retrieval logic for both sync and streaming paths."""

    # Check this user has any documents at all
    user_docs = await __import__("asyncio").to_thread(
        lambda: collection.get(
            where={"user_id": {"$eq": user_id}},
            include=[],
            limit=1,
        )
    )
    if not user_docs["ids"]:
        raise NoDocumentsError("No documents have been uploaded yet.")

    query_embedding = await __import__("asyncio").to_thread(
        _embeddings.embed_query, query
    )

    where_filter = _build_where_filter(user_id, doc_ids)

    try:
        results = await __import__("asyncio").to_thread(
            lambda: collection.query(
                query_embeddings=[query_embedding],
                n_results=TOP_K,
                where=where_filter,
                include=["documents", "metadatas"],
            )
        )
    except Exception as e:
        raise RuntimeError(f"Vector search failed: {e}") from e

    raw_docs = results["documents"][0]
    raw_metas = results["metadatas"][0]

    if not raw_docs:
        raise NoContentFoundError(
            "No relevant content found in the selected documents."
        )

    selected_texts, selected_metas = [], []
    seen_files: set = set()
    for text, meta in zip(raw_docs, raw_metas):
        fname = meta.get("file_name")
        if fname not in seen_files:
            selected_texts.append(text)
            selected_metas.append(meta)
            seen_files.add(fname)
        if len(selected_texts) >= MAX_SOURCES:
            break

    if len(selected_texts) < MIN_SOURCES:
        selected_texts = raw_docs[:MIN_SOURCES]
        selected_metas = raw_metas[:MIN_SOURCES]

    context = "\n\n".join(
        f"[Source: {m.get('file_name')}, Page: {m.get('page')}]\n{t}"
        for t, m in zip(selected_texts, selected_metas)
    )

    recent = await history.get_recent_messages(db, session_id, limit=HISTORY_TURNS)
    history_block = ""
    if recent:
        history_block = "Conversation history:\n" + "\n".join(
            f"{t['role'].capitalize()}: {t['content']}" for t in recent
        )

    parts = [SYSTEM_PROMPT]
    if history_block:
        parts.append(history_block)
    parts.append(f"Context:\n{context}")
    parts.append(f"Question: {query}")

    return "\n\n".join(parts), selected_metas


class DocumentStore:
    def __init__(self):
        self._lock = Lock()
        if CHROMA_API_KEY:
            self._client = chromadb.CloudClient(
                tenant=CHROMA_TENANT,
                database=CHROMA_DATABASE,
                api_key=CHROMA_API_KEY,
            )
        else:
            self._client = chromadb.HttpClient(
                host=CHROMA_HOST,
                port=CHROMA_PORT,
                settings=Settings(anonymized_telemetry=False),
            )
        with self._lock:
            self._collection = self._client.get_or_create_collection(
                name=CHROMA_COLLECTION,
                metadata={"hnsw:space": "cosine"},
            )

    # ------------------------------------------------------------------
    # Ingest — stores user_id in metadata
    # ------------------------------------------------------------------

    def process_document(self, file_path: str, user_id: str) -> str:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        doc_id = str(uuid.uuid4())
        file_name = os.path.basename(file_path)

        try:
            loader = PyPDFLoader(file_path)
            documents = loader.load()
        except Exception as e:
            raise RuntimeError(f"Failed to load PDF '{file_name}': {e}") from e

        if not documents:
            raise ValueError(f"No content could be extracted from '{file_name}'.")

        chunks = _splitter.split_documents(documents)
        texts = [chunk.page_content for chunk in chunks]
        metadatas = [
            {
                "doc_id": doc_id,
                "user_id": user_id,        # ← scopes this doc to the user
                "file_name": file_name,
                "page": str(chunk.metadata.get("page", "unknown")),
            }
            for chunk in chunks
        ]
        embeddings_list = _embeddings.embed_documents(texts)
        chunk_ids = [f"{doc_id}_{i}" for i in range(len(chunks))]

        with self._lock:
            self._collection.add(
                ids=chunk_ids,
                embeddings=embeddings_list,
                documents=texts,
                metadatas=metadatas,
            )

        return doc_id

    # ------------------------------------------------------------------
    # List documents — filtered by user_id
    # ------------------------------------------------------------------

    def list_documents(self, user_id: str) -> list[dict]:
        results = self._collection.get(
            where={"user_id": {"$eq": user_id}},
            include=["metadatas"],
        )
        metadatas = results.get("metadatas", [])
        seen: dict[str, dict] = {}
        for meta in metadatas:
            doc_id = meta.get("doc_id")
            if doc_id and doc_id not in seen:
                seen[doc_id] = {
                    "doc_id": doc_id,
                    "file_name": meta.get("file_name"),
                }
        return list(seen.values())

    # ------------------------------------------------------------------
    # Delete document — verifies ownership
    # ------------------------------------------------------------------

    def delete_document(self, doc_id: str, user_id: str) -> None:
        """
        Delete all chunks for a doc_id.
        Verifies the doc belongs to user_id first — raises PermissionError if not.
        """
        # Check ownership by fetching one chunk's metadata
        results = self._collection.get(
            where={"$and": [
                {"doc_id": {"$eq": doc_id}},
                {"user_id": {"$eq": user_id}},
            ]},
            include=["metadatas"],
            limit=1,
        )
        if not results["ids"]:
            raise PermissionError(
                "Document not found or does not belong to this user."
            )

        # Delete all chunks for this doc_id
        self._collection.delete(where={"doc_id": {"$eq": doc_id}})

    # ------------------------------------------------------------------
    # Delete by id — caller is responsible for authorization
    # ------------------------------------------------------------------

    def delete_document_by_id(self, doc_id: str) -> None:
        with self._lock:
            self._collection.delete(where={"doc_id": {"$eq": doc_id}})

    # ------------------------------------------------------------------
    # Streaming query
    # ------------------------------------------------------------------

    async def ask_question_stream(
        self,
        query: str,
        session_id: str,
        db: AsyncSession,
        doc_ids: list[str] | None = None,
        user_id: str = "",
    ) -> AsyncGenerator[str, None]:
        prompt, selected_metas = await _build_retrieval_inputs(
            query, session_id, doc_ids, user_id, self._collection, db
        )

        full_answer = []
        try:
            async for chunk in _llm.astream(prompt):
                token = chunk.content
                if token:
                    full_answer.append(token)
                    yield f"data: {json.dumps(token)}\n\n"
        except Exception as e:
            yield f"data: [ERROR]{e}\n\n"
            return

        answer = "".join(full_answer)
        await history.add_message(db, session_id, "user", query, user_id=user_id)
        await history.add_message(db, session_id, "assistant", answer, user_id=user_id)

        # Generate a title on the first message of a new session.
        # We check message count — if only 2 rows exist (the ones we just inserted),
        # this is the first turn so we generate and save a title.
        session_obj = await history.ensure_session(db, session_id, user_id=user_id)
        if session_obj.title is None:
            title = await generate_title(query)
            await history.update_session_title(db, session_id, title)
            # Send title to frontend so sidebar updates immediately
            yield f"data: [TITLE]{title}\n\n"

        sources = _dedupe_sources(selected_metas)
        yield f"data: [SOURCES]{json.dumps(sources)}\n\n"
        yield "data: [DONE]\n\n"

    # ------------------------------------------------------------------
    # Non-streaming query
    # ------------------------------------------------------------------

    async def ask_question(
        self,
        query: str,
        session_id: str,
        db: AsyncSession,
        doc_ids: list[str] | None = None,
        user_id: str = "",
    ) -> dict:
        prompt, selected_metas = await _build_retrieval_inputs(
            query, session_id, doc_ids, user_id, self._collection, db
        )

        try:
            response = await _llm.ainvoke(prompt)
        except Exception as e:
            raise RuntimeError(f"LLM call failed: {e}") from e

        answer = response.content
        await history.add_message(db, session_id, "user", query, user_id=user_id)
        await history.add_message(db, session_id, "assistant", answer, user_id=user_id)

        # Generate title on first message
        session_obj = await history.ensure_session(db, session_id, user_id=user_id)
        if session_obj.title is None:
            title = await generate_title(query)
            await history.update_session_title(db, session_id, title)
        else:
            title = None

        return {
            "answer": answer,
            "sources": _dedupe_sources(selected_metas),
            "title": title,  # None if not first message, string if newly generated
        }


document_store = DocumentStore()