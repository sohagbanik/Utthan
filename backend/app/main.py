"""
Utthan Platform - FastAPI Application Entry Point
Phase 2: Backend & API Foundation Layer
"""

import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.api.router import api_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "Backend API for Utthan: AI-Driven Voice Assistant for Livelihood Mapping "
        "and NSQF-Aligned Skilling Recommendations (SIH 2026)."
    ),
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configure Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Global Exception Handler to ensure safe, structured JSON errors without leaking stack traces
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled API exception for %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please contact support."}
    )

# Include Central API Router under /api
app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get("/", tags=["Root"], summary="API Root / Overview")
def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": f"{settings.API_PREFIX}/health",
        "status": "active"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
