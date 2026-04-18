"""
Auth routes: register, login, Google OAuth, logout.

JWT tokens minted here use the same secret as services/auth.py so the
existing get_current_user dependency verifies them without any changes.
"""

import os
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.auth import get_current_user
from services.database import User, get_db
from services.jwt_utils import create_access_token

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Shared response schema ────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str | None
    avatar_url: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _make_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(
            user.id, user.email, user.name, user.avatar_url
        ),
        user=UserOut(
            id=user.id,
            email=user.email,
            full_name=user.name,
            avatar_url=user.avatar_url,
        ),
    )


# ── Register ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if os.getenv("REGISTRATION_OPEN", "true").lower() == "false":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is currently closed.",
        )

    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        id=str(uuid.uuid4()),
        email=data.email,
        name=data.full_name,
        password_hash=pwd_context.hash(data.password),
    )
    db.add(user)
    await db.flush()
    return _make_response(user)


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not pwd_context.verify(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _make_response(user)


# ── Google OAuth ──────────────────────────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    token: str  # Google access token from @react-oauth/google


@router.post("/google", response_model=AuthResponse)
async def google_auth(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {data.token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token.",
        )

    info = resp.json()
    google_sub = info.get("sub")
    email = info.get("email")

    if not google_sub or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve user info from Google.",
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            id=f"google_{google_sub}",
            email=email,
            name=info.get("name"),
            avatar_url=info.get("picture"),
        )
        db.add(user)
        await db.flush()
    else:
        user.name = info.get("name")
        user.avatar_url = info.get("picture")

    return _make_response(user)


# ── Me ───────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    """Returns the current authenticated user. Used by the frontend to verify token validity on load."""
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.name,
        avatar_url=current_user.avatar_url,
    )


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout():
    # Stateless JWT — client removes the token; nothing to invalidate server-side.
    return None
