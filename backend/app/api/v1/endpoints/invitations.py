import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.audit import log_event

from app.api.deps import (
    get_current_user,
    get_workspace_membership,
    require_workspace_role,
)
from app.core.config import settings
from app.db.session import get_db
from app.models.invitation import Invitation, InvitationStatus
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.schemas.invitation import (
    InvitationAcceptResult,
    InvitationCreate,
    InvitationPublicRead,
    InvitationRead,
)
from app.services.email import send_email

router = APIRouter()


def build_invite_url(token: str) -> str:
    return f"{settings.APP_URL.rstrip('/')}/invite/{token}"


def serialize(inv: Invitation) -> InvitationRead:
    return InvitationRead(
        id=inv.id,
        workspace_id=inv.workspace_id,
        email=inv.email,
        role=inv.role,
        status=inv.status.value,
        invite_url=build_invite_url(inv.token),
        invited_by_id=inv.invited_by_id,
        created_at=inv.created_at,
        expires_at=inv.expires_at,
    )


def render_email(workspace_name: str, invite_url: str, days: int) -> str:
    return (
        f"You have been invited to join the \"{workspace_name}\" workspace on dDocDesk.\n\n"
        f"Accept the invitation:\n{invite_url}\n\n"
        f"This link expires in {days} days.\n\n"
        f"If you were not expecting this invitation, you can ignore it."
    )


# ---------------------------------------------------------------------------
# Workspace-scoped invitation management (requires membership)
# ---------------------------------------------------------------------------

@router.post(
    "/workspaces/{workspace_id}/invitations",
    response_model=InvitationRead,
)
async def create_invitation(
    workspace_id: uuid.UUID,
    payload: InvitationCreate,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner", "admin"})

    email = payload.email.lower()

    # If the user already exists, they should be added directly instead.
    existing_user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()

    if existing_user:
        already_member = (
            await db.execute(
                select(Membership).where(
                    Membership.workspace_id == workspace.id,
                    Membership.user_id == existing_user.id,
                )
            )
        ).scalar_one_or_none()

        if already_member:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this workspace",
            )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already has an account. Add them directly as a member instead.",
        )

    # Reuse an existing pending invitation rather than creating duplicates.
    pending = (
        await db.execute(
            select(Invitation).where(
                Invitation.workspace_id == workspace.id,
                Invitation.email == email,
                Invitation.status == InvitationStatus.PENDING,
            )
        )
    ).scalar_one_or_none()

    if pending:
        now = datetime.now(timezone.utc)
        if pending.expires_at > now:
            response = serialize(pending)
            return Response(
                content=response.model_dump_json(),
                status_code=status.HTTP_200_OK,
                media_type="application/json",
            )
        # Expired pending invite — revoke it and issue a fresh one below.
        pending.status = InvitationStatus.REVOKED

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.INVITATION_EXPIRY_DAYS
    )

    invitation = Invitation(
        workspace_id=workspace.id,
        email=email,
        role=payload.role,
        token=token,
        invited_by_id=current_user.id,
        status=InvitationStatus.PENDING,
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    await log_event(
        db, "invitation.created",
        workspace_id=workspace.id,
        user_id=current_user.id,
        resource_type="invitation",
        resource_id=invitation.id,
        metadata={"email": invitation.email, "role": invitation.role},
        request=request,
    )
    await db.commit()

    await send_email(
        to=email,
        subject=f"You've been invited to {workspace.name} on dDocDesk",
        body=render_email(workspace.name, build_invite_url(token), settings.INVITATION_EXPIRY_DAYS),
    )

    return serialize(invitation)


@router.get(
    "/workspaces/{workspace_id}/invitations",
    response_model=list[InvitationRead],
)
async def list_invitations(
    workspace_id: uuid.UUID,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner", "admin"})

    stmt = (
        select(Invitation)
        .where(
            Invitation.workspace_id == workspace.id,
            Invitation.status == InvitationStatus.PENDING,
        )
        .order_by(Invitation.created_at.desc())
    )
    result = await db.execute(stmt)
    return [serialize(inv) for inv in result.scalars().all()]


@router.delete(
    "/workspaces/{workspace_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_invitation(
    workspace_id: uuid.UUID,
    invitation_id: uuid.UUID,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner", "admin"})

    inv = (
        await db.execute(
            select(Invitation).where(
                Invitation.id == invitation_id,
                Invitation.workspace_id == workspace.id,
            )
        )
    ).scalar_one_or_none()

    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")

    inv.status = InvitationStatus.REVOKED
    await db.commit()

    await log_event(
        db, "invitation.revoked",
        workspace_id=workspace.id,
        user_id=membership.user_id,
        resource_type="invitation",
        resource_id=invitation_id,
        metadata={"email": inv.email},
        request=request,
    )
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Public invitation routes (no membership required)
# ---------------------------------------------------------------------------

@router.get("/invitations/{token}", response_model=InvitationPublicRead)
async def get_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    inv = (
        await db.execute(select(Invitation).where(Invitation.token == token))
    ).scalar_one_or_none()

    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")

    workspace = await db.get(Workspace, inv.workspace_id)
    expired = inv.expires_at < datetime.now(timezone.utc)

    return InvitationPublicRead(
        email=inv.email,
        role=inv.role,
        workspace_id=inv.workspace_id,
        workspace_name=workspace.name if workspace else "Unknown workspace",
        status=inv.status.value,
        expired=expired,
        expires_at=inv.expires_at,
    )


@router.post("/invitations/{token}/accept", response_model=InvitationAcceptResult)
async def accept_invitation(
    token: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inv = (
        await db.execute(select(Invitation).where(Invitation.token == token))
    ).scalar_one_or_none()

    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if inv.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invitation is already {inv.status.value}",
        )

    if inv.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invitation has expired",
        )

    if inv.email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This invitation was sent to {inv.email}. Sign in with that email address.",
        )

    existing = (
        await db.execute(
            select(Membership).where(
                Membership.workspace_id == inv.workspace_id,
                Membership.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if not existing:
        db.add(
            Membership(
                workspace_id=inv.workspace_id,
                user_id=current_user.id,
                role=inv.role,
            )
        )

    inv.status = InvitationStatus.ACCEPTED
    inv.accepted_at = datetime.now(timezone.utc)

    await db.commit()

    await log_event(
        db, "invitation.accepted",
        workspace_id=inv.workspace_id,
        user_id=current_user.id,
        resource_type="invitation",
        resource_id=inv.id,
        metadata={"email": inv.email, "role": inv.role},
        request=request,
    )
    await db.commit()

    return InvitationAcceptResult(workspace_id=inv.workspace_id, role=inv.role)
