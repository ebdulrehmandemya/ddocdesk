from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


ALLOWED_WORKSPACE_ROLES = {"owner", "admin", "member"}


def _normalize_role(value: str) -> str:
    role = value.strip().lower()

    if role not in ALLOWED_WORKSPACE_ROLES:
        raise ValueError("role must be one of: owner, admin, member")

    return role


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()


class WorkspaceRead(BaseModel):
    id: UUID
    name: str
    plan: str
    storage_quota: int
    created_at: datetime
    my_role: str | None = None


class MemberAdd(BaseModel):
    email: EmailStr
    role: str = "member"

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return _normalize_role(value)


class MemberUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return _normalize_role(value)


class MemberRead(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None = None
    role: str
    joined_at: datetime
