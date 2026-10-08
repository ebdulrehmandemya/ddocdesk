from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.models.document import DocumentStatus

class DocumentRead(BaseModel):
    id: UUID
    workspace_id: UUID
    file_name: str
    mime_type: str
    size_bytes: int
    status: DocumentStatus
    created_at: datetime
