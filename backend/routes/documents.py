"""
routes/documents.py
-------------------
Exposes document metadata stored in ChromaDB.

Endpoints:
  GET /documents/ — list all uploaded documents (doc_id + file_name)

Why is this needed?
  The frontend needs to know which documents are available so the user can:
    - See a list of uploaded files
    - Select specific documents to scope their questions to
  ChromaDB persists this across restarts, so the list survives server reboots.
"""

import asyncio

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from services.rag import document_store

router = APIRouter()


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class DocumentResponse(BaseModel):
    doc_id: str
    file_name: str


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=list[DocumentResponse],
    summary="List all uploaded documents",
)
async def list_documents():
    """
    Returns one entry per uploaded document with its doc_id and original filename.
    The frontend uses doc_id to filter chat queries to specific documents.
    """
    try:
        docs = await asyncio.to_thread(document_store.list_documents)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve documents: {e}",
        )

    return docs