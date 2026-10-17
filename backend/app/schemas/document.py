from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.models.document import DocumentStatus

class DocumentRead(BaseModel):
    id: UUID
    workspace_id: UUID
    folder_id: UUID | None = None
    file_name: str
    mime_type: str
    size_bytes: int
    status: DocumentStatus
    summary: str | None = None
    version: int = 1 
    created_at: datetime
    updated_at: datetime


class DocumentVersionRead(BaseModel):
    id: UUID
    document_id: UUID
    version_number: int
    file_name: str
    mime_type: str
    size_bytes: int
    uploaded_by_id: UUID
    uploaded_at: datetime
