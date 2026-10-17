from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document


async def get_workspace_storage_used(db: AsyncSession, workspace_id: UUID) -> int:
    """Calculate total bytes used by all documents in a workspace."""
    result = await db.execute(
        select(func.coalesce(func.sum(Document.size_bytes), 0)).where(
            Document.workspace_id == workspace_id
        )
    )
    return result.scalar() or 0


async def check_quota(
    db: AsyncSession, workspace_id: UUID, incoming_size: int, quota: int
) -> tuple[bool, int, int]:
    """
    Check if adding a file would exceed the workspace quota.
    Returns (is_within_quota, current_usage, quota_limit).
    """
    current_usage = await get_workspace_storage_used(db, workspace_id)
    is_within = (current_usage + incoming_size) <= quota
    return is_within, current_usage, quota
