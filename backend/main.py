"""
Application entry point.
init_db() is called on startup — creates all PostgreSQL tables if they
don't exist. Safe to call on every deploy.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routes.auth import router as auth_router
from routes.chat import router as chat_router
from routes.documents import router as documents_router
from routes.upload import router as upload_router
from services.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup — idempotent, safe on every deploy
    await init_db()
    print("DocuMind starting up — DB tables ready.")
    yield
    print("DocuMind shutting down.")


app = FastAPI(
    title="DocuMind API",
    description="Upload PDFs and ask questions across them using RAG.",
    version="0.3.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://yourdomain.com",  # replace with Vercel URL after deploy
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,      prefix="/auth",      tags=["Auth"])
app.include_router(upload_router,    prefix="/upload",    tags=["Upload"])
app.include_router(chat_router,      prefix="/chat",      tags=["Chat"])
app.include_router(documents_router, prefix="/documents", tags=["Documents"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return CORS headers even on unhandled 500s so the browser shows the real error."""
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
        headers=headers,
    )


@app.get("/", tags=["Health"])
async def health_check():
    return {"status": "ok", "message": "DocuMind API is running."}