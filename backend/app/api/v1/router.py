from fastapi import APIRouter
from app.api.v1.endpoints import (
    health, me, workspaces, documents, search, chat, folders, invitations, audit
)

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(me.router, prefix="/users", tags=["Users"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
api_router.include_router(folders.router, prefix="/workspaces", tags=["Folders"])
api_router.include_router(documents.router, prefix="/workspaces", tags=["Documents"])
api_router.include_router(search.router, prefix="/workspaces", tags=["Search"])
api_router.include_router(chat.router, prefix="/workspaces", tags=["Chat"])
api_router.include_router(invitations.router, tags=["Invitations"])
api_router.include_router(audit.router, tags=["Audit"])
