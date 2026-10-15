from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

class FolderUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

class FolderRead(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    created_by_id: UUID
    created_at: datetime
    document_count: int = 0

class DocumentMove(BaseModel):
    folder_id: UUID | None = None  # None means move to root
