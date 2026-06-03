"""
RAG service using PostgreSQL pgvector.
Replaces ChromaDB — all vector operations run against the same Neon Postgres
instance, so no separate service is needed.
"""

import asyncio
import json
import os
import uuid
from typing import AsyncGenerator

from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import text
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


def _vec_literal(embedding: list[float]) -> str:
    """Convert a float list to a PostgreSQL vector literal string."""
    return "[" + ",".join(f"{x:.8f}" for x in embedding) + "]"


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
    db: AsyncSession,
) -> tuple[str, list[dict]]:
    """Shared retrieval logic for both sync and streaming paths."""

    result = await db.execute(
        text("SELECT 1 FROM document_chunks WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    if not result.scalar_one_or_none():
        raise NoDocumentsError("No documents have been uploaded yet.")

    query_embedding = await _embeddings.aembed_query(query)
    vec = _vec_literal(query_embedding)

    where_parts = ["user_id = :user_id"]
    params: dict = {"user_id": user_id, "vec": vec, "k": TOP_K}

    if doc_ids:
        if len(doc_ids) == 1:
            where_parts.append("doc_id = :doc_id_0")
            params["doc_id_0"] = doc_ids[0]
        else:
            placeholders = ", ".join(f":doc_id_{i}" for i in range(len(doc_ids)))
            where_parts.append(f"doc_id IN ({placeholders})")
            for i, d in enumerate(doc_ids):
                params[f"doc_id_{i}"] = d

    where_clause = " AND ".join(where_parts)

    rows = (
        await db.execute(
            text(
                f"SELECT file_name, page, content "
                f"FROM document_chunks "
                f"WHERE {where_clause} "
                f"ORDER BY embedding <=> :vec::vector "
                f"LIMIT :k"
            ),
            params,
        )
    ).mappings().all()

    if not rows:
        raise NoContentFoundError(
            "No relevant content found in the selected documents."
        )

    selected_texts, selected_metas = [], []
    seen_files: set = set()
    for row in rows:
        fname = row["file_name"]
        if fname not in seen_files:
            selected_texts.append(row["content"])
            selected_metas.append({"file_name": row["file_name"], "page": row["page"]})
            seen_files.add(fname)
        if len(selected_texts) >= MAX_SOURCES:
            break

    if len(selected_texts) < MIN_SOURCES:
        selected_texts = [r["content"] for r in rows[:MIN_SOURCES]]
        selected_metas = [
            {"file_name": r["file_name"], "page": r["page"]} for r in rows[:MIN_SOURCES]
        ]

    context = "\n\n".join(
        f"[Source: {m['file_name']}, Page: {m['page']}]\n{t}"
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
    # ------------------------------------------------------------------
    # Ingest
    # ------------------------------------------------------------------

    async def process_document(
        self, file_path: str, user_id: str, db: AsyncSession
    ) -> str:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_name = os.path.basename(file_path)

        try:
            documents = await asyncio.to_thread(
                lambda: PyPDFLoader(file_path).load()
            )
        except Exception as e:
            raise RuntimeError(f"Failed to load PDF '{file_name}': {e}") from e

        if not documents:
            raise ValueError(f"No content could be extracted from '{file_name}'.")

        chunks = _splitter.split_documents(documents)
        texts = [c.page_content for c in chunks]
        embeddings_list = await _embeddings.aembed_documents(texts)

        doc_id = str(uuid.uuid4())

        rows = [
            {
                "id": f"{doc_id}_{i}",
                "doc_id": doc_id,
                "user_id": user_id,
                "file_name": file_name,
                "page": str(chunks[i].metadata.get("page", "unknown")),
                "content": texts[i],
                "vec": _vec_literal(embeddings_list[i]),
            }
            for i in range(len(chunks))
        ]

        await db.execute(
            text(
                "INSERT INTO document_chunks "
                "(id, doc_id, user_id, file_name, page, content, embedding) "
                "VALUES (:id, :doc_id, :user_id, :file_name, :page, :content, :vec::vector)"
            ),
            rows,
        )

        return doc_id

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete_document_by_id(self, doc_id: str, db: AsyncSession) -> None:
        await db.execute(
            text("DELETE FROM document_chunks WHERE doc_id = :doc_id"),
            {"doc_id": doc_id},
        )

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
            query, session_id, doc_ids, user_id, db
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

        session_obj = await history.ensure_session(db, session_id, user_id=user_id)
        if session_obj.title is None:
            title = await generate_title(query)
            await history.update_session_title(db, session_id, title)
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
            query, session_id, doc_ids, user_id, db
        )

        try:
            response = await _llm.ainvoke(prompt)
        except Exception as e:
            raise RuntimeError(f"LLM call failed: {e}") from e

        answer = response.content
        await history.add_message(db, session_id, "user", query, user_id=user_id)
        await history.add_message(db, session_id, "assistant", answer, user_id=user_id)

        session_obj = await history.ensure_session(db, session_id, user_id=user_id)
        if session_obj.title is None:
            title = await generate_title(query)
            await history.update_session_title(db, session_id, title)
        else:
            title = None

        return {
            "answer": answer,
            "sources": _dedupe_sources(selected_metas),
            "title": title,
        }


document_store = DocumentStore()
