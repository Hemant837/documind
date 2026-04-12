"""
Core RAG (Retrieval-Augmented Generation) logic.

New in this version:
  - ask_question_stream(): async generator yielding SSE tokens then a final
    JSON sources chunk — powers the streaming chat endpoint
  - Improved system prompt: structured instructions for accuracy, multi-doc
    synthesis, citation format, and follow-up handling
  - Sources (filename + page) returned alongside answers for citation chips

Flow:
  1. Upload  → process_document() chunks PDF → embeds → stores in ChromaDB
  2. Question → ask_question() or ask_question_stream() pulls history + chunks,
                builds prompt, calls LLM, persists both turns to SQLite
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
from dotenv import load_dotenv

from services.history import chat_history

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
TOP_K = 10
MAX_SOURCES = 4
MIN_SOURCES = 3
HISTORY_TURNS = 10

CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8000"))
CHROMA_COLLECTION = "documents"

# ---------------------------------------------------------------------------
# Typed exceptions
# ---------------------------------------------------------------------------

class NoDocumentsError(Exception):
    """Raised when a query arrives but no documents have been uploaded yet."""

class NoContentFoundError(Exception):
    """Raised when ChromaDB returns no chunks relevant to the query."""

# ---------------------------------------------------------------------------
# Shared singletons
# ---------------------------------------------------------------------------

_embeddings = OpenAIEmbeddings()

# streaming=True enables .astream() for token-by-token output
_llm = ChatOpenAI(model="gpt-4o-mini", streaming=True)

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
)

# ---------------------------------------------------------------------------
# Improved system prompt
# ---------------------------------------------------------------------------
# Structured into explicit rules so the LLM knows exactly how to behave:
#   1. Grounding    — use ONLY provided context, never hallucinate
#   2. Synthesis    — combine across sources when the answer spans multiple docs
#   3. Citations    — always state which source a claim comes from
#   4. Follow-ups   — use conversation history to resolve pronouns / references
#   5. Honesty      — say when the answer isn't in the docs, don't guess

SYSTEM_PROMPT = """\
You are a precise document assistant. Follow these rules strictly:

1. GROUNDING: Answer using ONLY the information in the provided context chunks.
   Never use outside knowledge or make assumptions beyond what is written.

2. SYNTHESIS: If the answer requires combining information from multiple sources,
   do so explicitly. State which parts came from which source.

3. CITATIONS: When making a claim, reference the source inline like this:
   "According to [filename, page N], ..." or "As stated in [filename], ..."

4. FOLLOW-UPS: Use the conversation history to resolve follow-up questions.
   If the user says "explain that further" or "what about X?", refer back to
   your previous answer and the same context.

5. HONESTY: If the context contains no relevant information to answer the question,
   say exactly: "I could not find the answer in the provided documents."
   Do not guess, infer, or fill gaps with general knowledge.

6. FORMAT: Use markdown. Use bullet points for lists, bold for key terms,
   and code blocks for any technical content.
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_retrieval_inputs(
    query: str,
    session_id: str,
    doc_ids: list[str] | None,
    collection,
) -> tuple[str, list[dict], list[dict]]:
    """
    Shared retrieval logic used by both ask_question and ask_question_stream.

    Returns:
        prompt        — the full prompt string to send to the LLM
        selected_metas — metadata dicts for the selected source chunks (for citations)
        history       — the chat history turns that were injected
    """
    if collection.count() == 0:
        raise NoDocumentsError("No documents have been uploaded yet.")

    query_embedding = _embeddings.embed_query(query)

    where_filter = None
    if doc_ids:
        where_filter = (
            {"doc_id": {"$eq": doc_ids[0]}}
            if len(doc_ids) == 1
            else {"doc_id": {"$in": doc_ids}}
        )

    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=TOP_K,
            where=where_filter,
            include=["documents", "metadatas"],
        )
    except Exception as e:
        raise RuntimeError(f"Vector search failed: {e}") from e

    raw_docs = results["documents"][0]
    raw_metas = results["metadatas"][0]

    if not raw_docs:
        raise NoContentFoundError("No relevant content found in the selected documents.")

    # Source diversity: one chunk per file up to MAX_SOURCES
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

    # Build context block — each chunk labelled with source + page
    context = "\n\n".join(
        f"[Source: {m.get('file_name')}, Page: {m.get('page')}]\n{t}"
        for t, m in zip(selected_texts, selected_metas)
    )

    # Inject chat history so the LLM can handle follow-ups
    history = chat_history.get_recent(session_id, limit=HISTORY_TURNS)
    history_block = ""
    if history:
        history_block = "Conversation history:\n" + "\n".join(
            f"{turn['role'].capitalize()}: {turn['content']}" for turn in history
        )

    parts = [SYSTEM_PROMPT]
    if history_block:
        parts.append(history_block)
    parts.append(f"Context:\n{context}")
    parts.append(f"Question: {query}")

    return "\n\n".join(parts), selected_metas


def _dedupe_sources(metas: list[dict]) -> list[dict]:
    """Return unique (file_name, page) pairs for citation chips."""
    seen = set()
    sources = []
    for m in metas:
        key = (m.get("file_name"), m.get("page"))
        if key not in seen:
            seen.add(key)
            sources.append({"file_name": m.get("file_name"), "page": m.get("page")})
    return sources


# ---------------------------------------------------------------------------
# DocumentStore
# ---------------------------------------------------------------------------

class DocumentStore:
    """
    Wraps a ChromaDB collection with thread-safe access.

    ChromaDB (running as a separate server process) handles persistence
    and metadata filtering natively.
    """

    def __init__(self):
        self._lock = Lock()
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
    # Ingest
    # ------------------------------------------------------------------

    def process_document(self, file_path: str) -> str:
        """
        Load a PDF → split into chunks → embed → store in ChromaDB.
        Returns a doc_id the client uses to scope future queries.
        """
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
    # Non-streaming query (kept for fallback / testing)
    # ------------------------------------------------------------------

    def ask_question(
        self,
        query: str,
        session_id: str,
        doc_ids: list[str] | None = None,
    ) -> dict:
        """
        Synchronous query. Returns {"answer": str, "sources": list[dict]}.
        Used by the non-streaming endpoint and tests.
        """
        prompt, selected_metas = _build_retrieval_inputs(
            query, session_id, doc_ids, self._collection
        )

        try:
            response = _llm.invoke(prompt)
        except Exception as e:
            raise RuntimeError(f"LLM call failed: {e}") from e

        answer = response.content
        chat_history.add(session_id, "user", query)
        chat_history.add(session_id, "assistant", answer)

        return {"answer": answer, "sources": _dedupe_sources(selected_metas)}

    # ------------------------------------------------------------------
    # Streaming query
    # ------------------------------------------------------------------

    async def ask_question_stream(
        self,
        query: str,
        session_id: str,
        doc_ids: list[str] | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Async generator for Server-Sent Events (SSE).

        Yields:
          - "data: <token>\\n\\n"  for each text token from the LLM
          - "data: [SOURCES]<json>\\n\\n"  once at the end with citation metadata
          - "data: [DONE]\\n\\n"  to signal the stream is complete

        The frontend reads the stream line by line:
          - Lines starting with "data: " are content
          - The [SOURCES] marker tells the frontend to parse JSON and render chips
          - [DONE] tells the frontend to stop reading

        History is saved after the full answer is assembled so we don't persist
        partial responses if the stream is interrupted.
        """
        # Retrieval is synchronous (ChromaDB client) — run in thread pool
        # so we don't block the event loop during the embedding + DB query
        prompt, selected_metas = await __import__("asyncio").to_thread(
            _build_retrieval_inputs,
            query,
            session_id,
            doc_ids,
            self._collection,
        )

        full_answer = []

        try:
            # .astream() yields AIMessageChunk objects — each has a .content string
            async for chunk in _llm.astream(prompt):
                token = chunk.content
                if token:
                    full_answer.append(token)
                    # SSE format: each event is "data: <payload>\n\n"
                    yield f"data: {token}\n\n"
        except Exception as e:
            yield f"data: [ERROR]{e}\n\n"
            return

        # Assemble final answer and persist to history
        answer = "".join(full_answer)
        await __import__("asyncio").to_thread(
            chat_history.add, session_id, "user", query
        )
        await __import__("asyncio").to_thread(
            chat_history.add, session_id, "assistant", answer
        )

        # Send sources as a single JSON chunk so the frontend can render chips
        sources = _dedupe_sources(selected_metas)
        yield f"data: [SOURCES]{json.dumps(sources)}\n\n"
        yield "data: [DONE]\n\n"

    # ------------------------------------------------------------------
    # Document listing
    # ------------------------------------------------------------------

    def list_documents(self) -> list[dict]:
        """
        Return one entry per uploaded document (doc_id + file_name).
        Deduplicates ChromaDB chunk metadata by doc_id.
        """
        results = self._collection.get(include=["metadatas"])
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


# Single shared instance — all routes import this object
document_store = DocumentStore()