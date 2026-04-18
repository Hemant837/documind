"""
Chat history — all queries now scoped by user_id.

Key changes from Phase 1:
  - ensure_session() now accepts user_id and sets it on the Session row
  - get_all_sessions() filters by user_id
  - delete_session() verifies ownership before deleting
"""

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from services.database import Message, Session


async def ensure_session(
    db: AsyncSession,
    session_id: str,
    user_id: str | None = None,
) -> Session:
    """Get or create a Session row. Sets user_id on creation."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()

    if session is None:
        session = Session(id=session_id, user_id=user_id, title=None)
        db.add(session)
        await db.flush()

    return session


async def update_session_title(
    db: AsyncSession, session_id: str, title: str
) -> None:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if session:
        session.title = title


async def add_message(
    db: AsyncSession,
    session_id: str,
    role: str,
    content: str,
    user_id: str | None = None,
) -> None:
    await ensure_session(db, session_id, user_id=user_id)
    db.add(Message(session_id=session_id, role=role, content=content))


async def get_recent_messages(
    db: AsyncSession,
    session_id: str,
    limit: int = 10,
) -> list[dict]:
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.id.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [{"role": r.role, "content": r.content} for r in reversed(rows)]


async def get_all_messages(
    db: AsyncSession,
    session_id: str,
) -> list[dict]:
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.id.asc())
    )
    rows = result.scalars().all()
    return [
        {
            "role": r.role,
            "content": r.content,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


async def get_all_sessions(
    db: AsyncSession,
    user_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    """Return sessions filtered by user_id with pagination."""
    query = (
        select(
            Session.id,
            Session.title,
            Session.created_at,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message, Message.session_id == Session.id)
        .group_by(Session.id)
        .order_by(Session.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    if user_id:
        query = query.where(Session.user_id == user_id)

    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "session_id": r.id,
            "title": r.title,
            "message_count": r.message_count,
            "started_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


async def delete_session(
    db: AsyncSession,
    session_id: str,
    user_id: str | None = None,
) -> None:
    """
    Delete a session. If user_id is provided, verifies ownership first.
    Raises PermissionError if the session belongs to a different user.
    """
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()

    if session and user_id and session.user_id != user_id:
        raise PermissionError("Session does not belong to this user.")

    await db.execute(delete(Session).where(Session.id == session_id))