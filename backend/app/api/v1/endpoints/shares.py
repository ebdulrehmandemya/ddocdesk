import io
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_workspace_membership, get_current_user, require_workspace_role
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.models.document import Document
from app.models.folder import Folder
from app.models.share_link import ShareLink, ShareTargetType
from app.schemas.share_link import (
    ShareLinkCreate,
    ShareLinkRead,
    ShareLinkPublic,
    ShareLinkVerify,
)
from app.services.password import hash_password, verify_password
from app.services.minio_client import s3_client
from app.services.audit import log_event

router = APIRouter()

BUCKET_NAME = "ddocdesk-docs"


def build_share_url(token: str) -> str:
    return f"{settings.APP_URL}/share/{token}"


# ---------------------------------------------------------------------------
# Authenticated endpoints (workspace members)
# ---------------------------------------------------------------------------

@router.post(
    "/workspaces/{workspace_id}/shares",
    response_model=ShareLinkRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_share_link(
    workspace_id: uuid.UUID,
    payload: ShareLinkCreate,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner", "admin", "member"})

    # Verify target exists and belongs to this workspace
    if payload.target_type == ShareTargetType.DOCUMENT:
        target = await db.get(Document, payload.target_id)
        if not target or target.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail="Document not found")
    else:
        target = await db.get(Folder, payload.target_id)
        if not target or target.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail="Folder not found")

    # Generate secure token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)

    share = ShareLink(
        workspace_id=workspace.id,
        token=token,
        target_type=payload.target_type,
        target_id=payload.target_id,
        created_by_id=current_user.id,
        password_hash=hash_password(payload.password) if payload.password else None,
        expires_at=expires_at,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    # Audit log
    await log_event(
        db,
        "share.created",
        workspace_id=workspace.id,
        user_id=current_user.id,
        resource_type="share_link",
        resource_id=share.id,
        event_metadata={
            "target_type": payload.target_type.value,
            "target_id": str(payload.target_id),
            "expires_in_days": payload.expires_in_days,
            "password_protected": payload.password is not None,
        },
        request=request,
    )
    await db.commit()

    return ShareLinkRead(
        id=share.id,
        workspace_id=share.workspace_id,
        token=share.token,
        target_type=share.target_type,
        target_id=share.target_id,
        created_by_id=share.created_by_id,
        expires_at=share.expires_at,
        access_count=share.access_count,
        created_at=share.created_at,
        revoked_at=share.revoked_at,
        url=build_share_url(token),
    )


@router.get(
    "/workspaces/{workspace_id}/shares",
    response_model=list[ShareLinkRead],
)
async def list_share_links(
    workspace_id: uuid.UUID,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership

    result = await db.execute(
        select(ShareLink)
        .where(
            ShareLink.workspace_id == workspace.id,
            ShareLink.revoked_at.is_(None),
        )
        .order_by(ShareLink.created_at.desc())
    )
    shares = result.scalars().all()

    return [
        ShareLinkRead(
            id=s.id,
            workspace_id=s.workspace_id,
            token=s.token,
            target_type=s.target_type,
            target_id=s.target_id,
            created_by_id=s.created_by_id,
            expires_at=s.expires_at,
            access_count=s.access_count,
            created_at=s.created_at,
            revoked_at=s.revoked_at,
            url=build_share_url(s.token),
        )
        for s in shares
    ]


@router.delete(
    "/workspaces/{workspace_id}/shares/{share_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_share_link(
    workspace_id: uuid.UUID,
    share_id: uuid.UUID,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner", "admin"})

    share = await db.get(ShareLink, share_id)
    if not share or share.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Share link not found")

    share.revoked_at = datetime.now(timezone.utc)
    await db.commit()

    await log_event(
        db,
        "share.revoked",
        workspace_id=workspace.id,
        user_id=current_user.id,
        resource_type="share_link",
        resource_id=share.id,
        request=request,
    )
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Public endpoints (no authentication required)
# ---------------------------------------------------------------------------

@router.get("/shares/public/{token}", response_model=ShareLinkPublic)
async def get_public_share_info(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    share = (
        await db.execute(select(ShareLink).where(ShareLink.token == token))
    ).scalar_one_or_none()

    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    if share.revoked_at:
        raise HTTPException(status_code=410, detail="Share link has been revoked")

    if share.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Share link has expired")

    # Get target info
    if share.target_type == ShareTargetType.DOCUMENT:
        doc = await db.get(Document, share.target_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Shared document no longer exists")
        return ShareLinkPublic(
            target_type=share.target_type,
            file_name=doc.file_name,
            mime_type=doc.mime_type,
            size_bytes=doc.size_bytes,
            requires_password=share.password_hash is not None,
            expires_at=share.expires_at,
        )
    else:
        folder = await db.get(Folder, share.target_id)
        if not folder:
            raise HTTPException(status_code=404, detail="Shared folder no longer exists")
        return ShareLinkPublic(
            target_type=share.target_type,
            file_name=folder.name,
            mime_type="application/x-folder",
            size_bytes=0,
            requires_password=share.password_hash is not None,
            expires_at=share.expires_at,
        )


@router.post("/shares/public/{token}/verify")
async def verify_share_password(
    token: str,
    payload: ShareLinkVerify,
    db: AsyncSession = Depends(get_db),
):
    share = (
        await db.execute(select(ShareLink).where(ShareLink.token == token))
    ).scalar_one_or_none()

    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    if share.revoked_at or share.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Share link is no longer valid")

    if not share.password_hash:
        return {"verified": True}

    if not verify_password(payload.password, share.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    return {"verified": True}


@router.get("/shares/public/{token}/download")
async def download_shared_file(
    token: str,
    password: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    share = (
        await db.execute(select(ShareLink).where(ShareLink.token == token))
    ).scalar_one_or_none()

    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    if share.revoked_at:
        raise HTTPException(status_code=410, detail="Share link has been revoked")

    if share.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Share link has expired")

    # Verify password if required
    if share.password_hash:
        if not password or not verify_password(password, share.password_hash):
            raise HTTPException(status_code=401, detail="Password required or incorrect")

    # Only documents can be downloaded directly
    if share.target_type != ShareTargetType.DOCUMENT:
        raise HTTPException(
            status_code=400, detail="Folder sharing download not yet supported"
        )

    doc = await db.get(Document, share.target_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document no longer exists")

    # Increment access count
    share.access_count += 1
    await db.commit()

    # Stream file from MinIO
    def get_file():
        response = s3_client.get_object(Bucket=BUCKET_NAME, Key=doc.minio_key)
        return response["Body"].read()

    import asyncio
    file_bytes = await asyncio.to_thread(get_file)

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.file_name}"'},
    )
