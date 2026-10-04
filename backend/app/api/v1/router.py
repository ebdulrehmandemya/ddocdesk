# backend/app/api/v1/router.py
from fastapi import APIRouter
from app.api.v1.endpoints import health, me

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(me.router, prefix="/users", tags=["Users"])
