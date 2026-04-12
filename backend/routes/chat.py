"""
routes/chat.py
--------------
Handles question-answering and chat history retrieval.

Endpoints:
  POST /chat/stream            — streaming SSE response (primary)
  POST /chat/                  — non-streaming fallback
  GET  /chat/history/{session_id} — fetch full conversation
  GET  /chat/history              — list all sessions
  DELETE /chat/history/{session_id} — clear a conversation

Streaming vs non-streaming:
  The stream endpoint uses FastAPI's StreamingResponse with text/event-stream.
  The frontend reads tokens as they arrive and renders them progressively.
  The non-streaming endpoint is kept for testing and as a fallback.
"""

import asyncio

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from services.history import chat_history
from services.rag import NoContentFoundError, NoDocumentsError, document_store

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    session_id: str = Field(..., min_length=1, description="Frontend-generated conversation ID")
    doc_ids: list[str] | None = None

    @field_validator("doc_ids", mode="before")
    @classmethod
    def validate_doc_ids(cls, v):
        if v is None:
            return v
        if not v:
            raise ValueError("doc_ids must not be an empty list. Pass null to search all documents.")
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
    message_count: int
    started_at: str


# ---------------------------------------------------------------------------
# Streaming endpoint (primary)
# ---------------------------------------------------------------------------

@router.post(
    "/stream",
    summary="Ask a question with streaming SSE response",
)
async def ask_question_stream(data: QuestionRequest):
    """
    Returns a Server-Sent Events stream.

    The client reads the stream line by line:
      - "data: <token>"         → append token to the current message
      - "data: [SOURCES]<json>" → parse JSON and render citation chips
      - "data: [ERROR]<msg>"    → surface error to the user
      - "data: [DONE]"          → stream finished

    NoDocumentsError and NoContentFoundError are caught here and sent as
    [ERROR] events so the frontend can handle them gracefully without
    the stream just hanging.
    """
    async def event_generator():
        try:
            async for chunk in document_store.ask_question_stream(
                data.question, data.session_id, data.doc_ids
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
        # These headers prevent proxies and browsers from buffering the stream
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Non-streaming endpoint (fallback)
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=QuestionResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask a question (non-streaming)",
)
async def ask_question_endpoint(data: QuestionRequest):
    """
    Blocking version — waits for the full LLM response before returning.
    Useful for testing, scripts, or clients that don't support SSE.
    """
    try:
        result = await asyncio.to_thread(
            document_store.ask_question,
            data.question,
            data.session_id,
            data.doc_ids,
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

@router.get(
    "/history/{session_id}",
    response_model=list[MessageResponse],
    summary="Get full conversation history for a session",
)
async def get_session_history(session_id: str):
    messages = await asyncio.to_thread(chat_history.get_all, session_id)
    if not messages:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No history found for session '{session_id}'.",
        )
    return messages


@router.get(
    "/history",
    response_model=list[SessionResponse],
    summary="List all chat sessions",
)
async def list_sessions():
    sessions = await asyncio.to_thread(chat_history.get_sessions)
    return sessions


@router.delete(
    "/history/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete all messages in a session",
)
async def delete_session(session_id: str):
    await asyncio.to_thread(chat_history.delete_session, session_id)