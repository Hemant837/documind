"""
Document listing and deletion — scoped to the authenticated user.
Postgres is the source of truth for document metadata; ChromaDB holds the vectors.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.auth import get_current_user
from services.database import Document, User, get_db
from services.rag import document_store

router = APIRouter()


class DocumentResponse(BaseModel):
    doc_id: str
    file_name: str
    file_size: int | None = None


@router.get("/", response_model=list[DocumentResponse])
async def list_documents(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    docs = result.scalars().all()
    return [
        DocumentResponse(doc_id=d.id, file_name=d.file_name, file_size=d.file_size)
        for d in docs
    ]


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document not found or does not belong to you.",
        )

    try:
        await asyncio.to_thread(document_store.delete_document_by_id, doc_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete from vector store: {e}",
        )

    await db.delete(doc)
