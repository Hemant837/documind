"""
All routes now receive an AsyncSession via Depends(get_db).
The session is committed automatically by get_db() on clean exit.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

import services.history as history
from services.auth import get_current_user
from services.database import User, get_db
from services.rag import NoContentFoundError, NoDocumentsError, document_store

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    session_id: str = Field(..., min_length=1)
    doc_ids: list[str] | None = None

    @field_validator("doc_ids", mode="before")
    @classmethod
    def validate_doc_ids(cls, v):
        if v is None:
            return v
        if not v:
            raise ValueError("doc_ids must not be an empty list.")
        if any(not isinstance(d, str) or not d.strip() for d in v):
            raise ValueError("Each doc_id must be a non-empty string.")
        return v


class QuestionResponse(BaseModel):
    question: str
    answer: str
    session_id: str
    sources: list[dict]


class MessageResponse(BaseModel):
    role: str
    content: str
    created_at: str


class SessionResponse(BaseModel):
    session_id: str
    title: str | None
    message_count: int
    started_at: str


# ---------------------------------------------------------------------------
# Streaming endpoint
# ---------------------------------------------------------------------------

@router.post("/stream", summary="Ask a question with streaming SSE response")
async def ask_question_stream(
    data: QuestionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a Server-Sent Events stream.
    The db session is injected per request — history is saved inside
    the stream generator using this session.
    """
    async def event_generator():
        try:
            async for chunk in document_store.ask_question_stream(
                data.question, data.session_id, db, data.doc_ids,
                user_id=current_user.id,
            ):
                yield chunk
        except NoDocumentsError as e:
            yield f"data: [ERROR]{e}\n\n"
        except NoContentFoundError as e:
            yield f"data: [ERROR]{e}\n\n"
        except RuntimeError as e:
            yield f"data: [ERROR]Upstream error: {e}\n\n"
        except Exception:
            yield "data: [ERROR]An unexpected error occurred.\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Non-streaming endpoint
# ---------------------------------------------------------------------------

@router.post("/", response_model=QuestionResponse, status_code=status.HTTP_200_OK)
async def ask_question_endpoint(
    data: QuestionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await document_store.ask_question(
            data.question, data.session_id, db, data.doc_ids,
            user_id=current_user.id,
        )
    except NoDocumentsError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except NoContentFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred.",
        )

    return QuestionResponse(
        question=data.question,
        answer=result["answer"],
        session_id=data.session_id,
        sources=result["sources"],
    )


# ---------------------------------------------------------------------------
# History endpoints
# ---------------------------------------------------------------------------

@router.get("/history/{session_id}", response_model=list[MessageResponse])
async def get_session_history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    messages = await history.get_all_messages(db, session_id)
    if not messages:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No history found for session '{session_id}'.",
        )
    return messages


@router.get("/history", response_model=list[SessionResponse])
async def list_sessions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await history.get_all_sessions(db, user_id=current_user.id, limit=limit, offset=offset)


@router.delete("/history/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session_route(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await history.delete_session(db, session_id, user_id=current_user.id)