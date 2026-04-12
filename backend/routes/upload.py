"""
routes/upload.py
----------------
Handles PDF file uploads.

Flow:
  1. Validate the file is a PDF (by extension and MIME type)
  2. Sanitize the filename to prevent path traversal attacks
  3. Stream the file to disk in chunks (avoids loading large files into memory)
  4. Hand the saved path to the RAG service for processing
  5. Delete the file from disk once it's been embedded — we don't need it anymore
  6. Return the doc_id to the client so it can scope future queries
"""

import os
import shutil
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from services.rag import document_store

router = APIRouter()

UPLOAD_DIR = "uploads"
ALLOWED_EXTENSIONS = {".pdf"}
ALLOWED_MIME_TYPES = {"application/pdf"}
MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

os.makedirs(UPLOAD_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Response schema
# Defining this explicitly means FastAPI generates accurate OpenAPI docs
# and clients can rely on the shape of the response.
# ---------------------------------------------------------------------------

class UploadResponse(BaseModel):
    message: str
    filename: str
    doc_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_filename(original: str) -> str:
    """
    Strip any directory components from the filename to prevent path traversal.
    e.g. "../../etc/passwd.pdf" → "passwd.pdf"
    Then prefix with a UUID so collisions between uploads are impossible.
    """
    base = os.path.basename(original)          # drop any leading path
    base = base.replace(" ", "_")              # spaces cause issues in some systems
    return f"{uuid.uuid4().hex}_{base}"


def _validate_file(file: UploadFile) -> None:
    """Check extension and MIME type before touching the file contents."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided.",
        )

    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Only PDF files are accepted. Got: '{ext}'",
        )

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Invalid MIME type: '{file.content_type}'. Expected 'application/pdf'.",
        )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF document for indexing",
)
async def upload_file(file: UploadFile = File(...)):
    # --- Validate before touching disk ---
    _validate_file(file)

    safe_name = _safe_filename(file.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    # --- Stream to disk ---
    # Reading in chunks avoids loading a 20 MB PDF entirely into RAM.
    # We also enforce a size cap here to prevent abuse.
    try:
        bytes_written = 0
        with open(file_path, "wb") as out:
            while chunk := await file.read(1024 * 64):   # 64 KB at a time
                bytes_written += len(chunk)
                if bytes_written > MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds the {MAX_FILE_SIZE_MB} MB limit.",
                    )
                out.write(chunk)
    except HTTPException:
        # Clean up partially written file before re-raising
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {e}",
        )

    # --- Process into vector DB, then clean up ---
    # The file is only needed during embedding; after that the FAISS index
    # holds all the information we need and the raw file is just wasted disk.
    try:
        doc_id = document_store.process_document(file_path)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Processing error: {e}",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing the document.",
        )
    finally:
        # Always remove the temp file whether processing succeeded or failed
        if os.path.exists(file_path):
            os.remove(file_path)

    return UploadResponse(
        message="File uploaded and processed successfully.",
        filename=file.filename,
        doc_id=doc_id,
    )