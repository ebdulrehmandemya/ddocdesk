import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_workspace_membership, require_workspace_role
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.schemas.audit_log import AuditLogPage, AuditLogRead

router = APIRouter()

# Map UI filter categories to action prefixes
CATEGORY_PREFIXES = {
    "document": "document.",
    "member": ["member.", "invitation."],
    "workspace": "workspace.",
    "search": "search.",
    "chat": "chat.",
}


@router.get("/workspaces/{workspace_id}/audit-logs", response_model=AuditLogPage)
async def list_audit_logs(
    workspace_id: uuid.UUID,
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner", "admin"})

    base_filter = AuditLog.workspace_id == workspace.id

    # Apply category filter
    if category and category in CATEGORY_PREFIXES:
        prefix = CATEGORY_PREFIXES[category]
        if isinstance(prefix, list):
            category_filter = AuditLog.action.like(prefix[0] + "%")
            for p in prefix[1:]:
                category_filter = category_filter | AuditLog.action.like(p + "%")
            base_filter = base_filter & category_filter
        else:
            base_filter = base_filter & AuditLog.action.like(prefix + "%")

    # Total count
    total = await db.scalar(
        select(func.count(AuditLog.id)).where(base_filter)
    ) or 0

    # Paginated rows, joined with the actor's email
    offset = (page - 1) * page_size
    stmt = (
        select(AuditLog, User.email)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(base_filter)
        .order_by(AuditLog.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = [
        AuditLogRead(
            id=log.id,
            action=log.action,
            user_id=log.user_id,
            user_email=email,
            workspace_id=log.workspace_id,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            metadata=log.event_metadata,
            ip_address=log.ip_address,
            created_at=log.created_at,
        )
        for log, email in rows
    ]

    return AuditLogPage(items=items, total=total, page=page, page_size=page_size)
