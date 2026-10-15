from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

# Owners cannot be created by invitation — ownership transfer must be explicit.
ALLOWED_INVITE_ROLES = {"admin", "member"}


class InvitationCreate(BaseModel):
    email: EmailStr
    role: str = "member"

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        role = value.strip().lower()
        if role not in ALLOWED_INVITE_ROLES:
            raise ValueError("role must be one of: admin, member")
        return role


class InvitationRead(BaseModel):
    id: UUID
    workspace_id: UUID
    email: str
    role: str
    status: str
    invite_url: str
    invited_by_id: UUID
    created_at: datetime
    expires_at: datetime


class InvitationPublicRead(BaseModel):
    """Returned to unauthenticated visitors opening an invite link."""
    email: str
    role: str
    workspace_id: UUID
    workspace_name: str
    status: str
    expired: bool
    expires_at: datetime


class InvitationAcceptResult(BaseModel):
    workspace_id: UUID
    role: str
