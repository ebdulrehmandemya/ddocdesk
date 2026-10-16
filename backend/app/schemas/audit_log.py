from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class AuditLogRead(BaseModel):
    id: UUID
    action: str
    user_id: UUID | None
    user_email: str | None
    workspace_id: UUID | None
    resource_type: str | None
    resource_id: str | None
    metadata: dict | None
    ip_address: str | None
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogRead]
    total: int
    page: int
    page_size: int
