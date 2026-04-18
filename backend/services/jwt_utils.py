"""
JWT minting utility. Complements services/auth.py (which only verifies).

Token claims:
  sub      → user id
  email    → user email
  name     → display name (optional)
  picture  → avatar URL (optional)
  exp      → expiry
  jti      → unique token id
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt

SECRET = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7


def create_access_token(
    user_id: str,
    email: str,
    name: str | None = None,
    picture: str | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)
