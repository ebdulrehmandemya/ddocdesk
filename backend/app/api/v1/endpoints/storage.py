from uuid import UUID
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_workspace_membership
from app.db.session import get_db
from app.models.workspace import Membership, Workspace
from app.services.storage import get_workspace_storage_used

router = APIRouter()


class StorageUsageRead(BaseModel):
    used_bytes: int
    quota_bytes: int
    usage_percentage: float


@router.get("/{workspace_id}/storage", response_model=StorageUsageRead)
async def get_storage_usage(
    workspace_id: UUID,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db=Depends(get_db),
):
    workspace, _ = workspace_membership
    used = await get_workspace_storage_used(db, workspace.id)
    quota = workspace.storage_quota or 0
    percentage = (used / quota * 100) if quota > 0 else 0.0

    return StorageUsageRead(
        used_bytes=used,
        quota_bytes=quota,
        usage_percentage=round(percentage, 2),
    )
