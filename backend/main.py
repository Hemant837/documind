"""
main.py
-------
Application entry point.

Registers all routers, middleware, and lifecycle hooks.
The lifespan context manager is the modern FastAPI way to run startup/shutdown
logic — replaces the deprecated @app.on_event("startup") pattern.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.chat import router as chat_router
from routes.documents import router as documents_router
from routes.upload import router as upload_router
from services.history import chat_history  # ensures DB + table exist on startup


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: importing chat_history above already initialises SQLite and
    creates the messages table if it doesn't exist. ChromaDB collection is
    created (or reopened) inside DocumentStore.__init__ on import.
    Nothing extra needed here — this is a good place to add DB migrations,
    warm-up embedding calls, or health checks against ChromaDB in future.
    """
    print("DocuMind starting up...")
    yield
    print("DocuMind shutting down...")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DocuMind API",
    description="Upload PDFs and ask questions across them using RAG.",
    version="0.2.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

# Never use allow_origins=["*"] with allow_credentials=True — browsers reject it.
# List your actual frontend origins explicitly.
ALLOWED_ORIGINS = [
    "http://localhost:3000",    # Next.js dev server
    "https://yourdomain.com",  # Production frontend — update before deploy
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(upload_router,    prefix="/upload",    tags=["Upload"])
app.include_router(chat_router,      prefix="/chat",      tags=["Chat"])
app.include_router(documents_router, prefix="/documents", tags=["Documents"])


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "message": "DocuMind API is running."}