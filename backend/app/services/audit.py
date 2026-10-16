from uuid import UUID

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


def get_client_ip(request: Request | None) -> str | None:
    """
    Resolve the real client IP.

    Because requests pass through the Next.js proxy, we trust the
    X-Forwarded-For header when present, then fall back to the socket peer.
    """
    if request is None:
        return None

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    if request.client:
        return request.client.host

    return None


async def log_event(
    db: AsyncSession,
    action: str,
    *,
    workspace_id: UUID | None = None,
    user_id: UUID | None = None,
    resource_type: str | None = None,
    resource_id: UUID | str | None = None,
    metadata: dict | None = None,
    request: Request | None = None,
) -> None:
    """
    Record an audit event.

    This adds the entry to the current session without committing, so it
    participates in the caller's transaction. Callers that perform read-only
    work (search, chat listing) should commit explicitly afterwards.
    """
    entry = AuditLog(
        action=action,
        workspace_id=workspace_id,
        user_id=user_id,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        metadata=metadata,
        ip_address=get_client_ip(request),
    )
    db.add(entry)
