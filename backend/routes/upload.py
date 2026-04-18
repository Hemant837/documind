"""
Upload route: accepts a PDF, checks for duplicates, processes it through the
RAG pipeline, persists metadata to Postgres, and returns the doc_id.
"""

import asyncio
import os
import re
import shutil
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.auth import get_current_user
from services.database import Document, User, get_db
from services.rag import document_store

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_CONTENT_TYPES = {"application/pdf"}
MAX_FILE_SIZE_MB = 50


class UploadResponse(BaseModel):
    message: str
    filename: str
    doc_id: str


def _sanitize_filename(name: str | None) -> str:
    if not name:
        return "document.pdf"
    basename = os.path.basename(name)
    return re.sub(r"[^\w.\-]", "_", basename) or "document.pdf"


@router.post("/", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are supported.",
        )

    contents = await file.read()

    if len(contents) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {MAX_FILE_SIZE_MB} MB limit.",
        )

    original_name = _sanitize_filename(file.filename)

    # Reject duplicates before doing any expensive processing
    existing = await db.execute(
        select(Document).where(
            Document.user_id == current_user.id,
            Document.file_name == original_name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{original_name}" is already in your library.',
        )

    temp_dir = os.path.join(UPLOAD_DIR, str(uuid.uuid4()))
    os.makedirs(temp_dir)
    file_path = os.path.join(temp_dir, original_name)

    try:
        with open(file_path, "wb") as f:
            f.write(contents)

        doc_id = await asyncio.to_thread(
            document_store.process_document, file_path, current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process the uploaded file.",
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    # Persist metadata — get_db commits on clean exit
    db.add(Document(
        id=doc_id,
        user_id=current_user.id,
        file_name=original_name,
        file_size=len(contents),
    ))

    return UploadResponse(
        message="Document uploaded and processed successfully.",
        filename=original_name,
        doc_id=doc_id,
    )
