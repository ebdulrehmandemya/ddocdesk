from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field
from typing import Optional

from app.models.share_link import ShareTargetType


class ShareLinkCreate(BaseModel):
    target_type: ShareTargetType
    target_id: UUID
    expires_in_days: int = Field(default=7, ge=1, le=365)
    password: Optional[str] = Field(default=None, min_length=4, max_length=128)


class ShareLinkRead(BaseModel):
    id: UUID
    workspace_id: UUID
    token: str
    target_type: ShareTargetType
    target_id: UUID
    created_by_id: UUID
    expires_at: datetime
    access_count: int
    created_at: datetime
    revoked_at: Optional[datetime] = None
    url: str  # Full share URL


class ShareLinkPublic(BaseModel):
    """Returned to unauthenticated visitors."""
    target_type: ShareTargetType
    file_name: str
    mime_type: str
    size_bytes: int
    requires_password: bool
    expires_at: datetime


class ShareLinkVerify(BaseModel):
    password: str
