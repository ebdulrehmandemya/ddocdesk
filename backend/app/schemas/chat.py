from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from typing import Optional

class Citation(BaseModel):
    document_id: UUID
    chunk_index: int
    text: str
    file_name: str

class MessageRead(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    citations: Optional[list[Citation]] = None
    created_at: datetime

class ConversationRead(BaseModel):
    id: UUID
    workspace_id: UUID
    title: str
    created_at: datetime

class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[UUID] = None
