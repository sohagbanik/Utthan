"""
Utthan Platform - Vercel Deployment & Root FastAPI Entry Point
Exposes the ASGI `app` instance from `app.main` for Vercel Serverless Functions.
"""

from app.main import app

__all__ = ["app"]
