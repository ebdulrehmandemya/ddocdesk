from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response, status, Request
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_workspace_membership, require_workspace_role
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.models.document import Document, DocumentChunk
from app.models.document_version import DocumentVersion
from app.models.chat import Conversation, Message
from app.models.invitation import Invitation
from app.models.folder import Folder
from app.models.audit_log import AuditLog
from app.services.audit import log_event
from app.models.share_link import ShareLink
from app.api.deps import (
    get_current_user,
    get_workspace_membership,
    require_workspace_role,
)
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.schemas.workspace import (
    MemberAdd,
    MemberRead,
    MemberUpdate,
    WorkspaceCreate,
    WorkspaceRead,
    WorkspaceUpdate,
)

router = APIRouter()


def serialize_workspace(workspace: Workspace, role: str) -> WorkspaceRead:
    return WorkspaceRead(
        id=workspace.id,
        name=workspace.name,
        plan=workspace.plan,
        storage_quota=workspace.storage_quota,
        created_at=workspace.created_at,
        my_role=role,
    )


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    result = await db.execute(statement)
    return result.scalar_one_or_none()


@router.post(
    "",
    response_model=WorkspaceRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_workspace(
    payload: WorkspaceCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace = Workspace(
        name=payload.name,
        storage_quota=104857600,  # 100 MB default for free plan
    )    
    db.add(workspace)
    await db.flush()

    membership = Membership(
        user_id=current_user.id,
        workspace_id=workspace.id,
        role="owner",
    )
    db.add(membership)

    await db.commit()
    await db.refresh(workspace)

    await log_event(
        db, "workspace.created",
        workspace_id=workspace.id,
        user_id=current_user.id,
        resource_type="workspace",
        resource_id=workspace.id,
        event_metadata={"name": workspace.name},
        request=request,
    )
    await db.commit()

    return serialize_workspace(workspace, "owner")


@router.get("", response_model=list[WorkspaceRead])
async def list_my_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    statement = (
        select(Workspace, Membership.role)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(Membership.user_id == current_user.id)
        .order_by(Workspace.created_at.desc())
    )

    result = await db.execute(statement)
    rows = result.all()

    return [serialize_workspace(workspace, role) for workspace, role in rows]


@router.get("/{workspace_id}", response_model=WorkspaceRead)
async def get_workspace(
    workspace_membership: tuple[Workspace, Membership] = Depends(
        get_workspace_membership
    ),
):
    workspace, membership = workspace_membership
    return serialize_workspace(workspace, membership.role)


@router.post(
    "/{workspace_id}/members",
    response_model=MemberRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    payload: MemberAdd,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(
        get_workspace_membership
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership

    require_workspace_role(membership, {"owner", "admin"})

    email = payload.email.lower()

    target_user = await get_user_by_email(db, email)

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has not signed in yet",
        )

    existing_membership_statement = select(Membership).where(
        Membership.workspace_id == workspace.id,
        Membership.user_id == target_user.id,
    )

    existing_membership_result = await db.execute(existing_membership_statement)
    existing_membership = existing_membership_result.scalar_one_or_none()

    if existing_membership:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this workspace",
        )

    if payload.role == "owner" and membership.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can add new owners",
        )

    new_membership = Membership(
        workspace_id=workspace.id,
        user_id=target_user.id,
        role=payload.role,
    )

    db.add(new_membership)
    await db.commit()
    await db.refresh(new_membership)

    await log_event(
        db, "member.added",
        workspace_id=workspace.id,
        user_id=membership.user_id,
        resource_type="user",
        resource_id=target_user.id,
        event_metadata={"email": target_user.email, "role": new_membership.role},
        request=request,
    )
    await db.commit()

    return MemberRead(
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=new_membership.role,
        joined_at=new_membership.joined_at,
    )


@router.get("/{workspace_id}/members", response_model=list[MemberRead])
async def list_members(
    workspace_membership: tuple[Workspace, Membership] = Depends(
        get_workspace_membership
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, _membership = workspace_membership

    statement = (
        select(User, Membership.role, Membership.joined_at)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.workspace_id == workspace.id)
        .order_by(Membership.joined_at.asc())
    )

    result = await db.execute(statement)
    rows = result.all()

    return [
        MemberRead(
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=role,
            joined_at=joined_at,
        )
        for user, role, joined_at in rows
    ]


@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberRead)
async def update_member_role(
    user_id: UUID,
    request: Request,
    payload: MemberUpdate,
    workspace_membership: tuple[Workspace, Membership] = Depends(
        get_workspace_membership
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership

    require_workspace_role(membership, {"owner", "admin"})

    target_membership_statement = select(Membership).where(
        Membership.workspace_id == workspace.id,
        Membership.user_id == user_id,
    )

    target_membership_result = await db.execute(target_membership_statement)
    target_membership = target_membership_result.scalar_one_or_none()

    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    if membership.role == "admin" and target_membership.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot modify owners",
        )

    if payload.role == "owner" and membership.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can assign the owner role",
        )

    if target_membership.role == "owner" and payload.role != "owner":
        owner_count = await db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.workspace_id == workspace.id,
                Membership.role == "owner",
            )
        )

        if owner_count is None or owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workspace must have at least one owner",
            )

    target_membership.role = payload.role

    await db.commit()
    await db.refresh(target_membership)

    await log_event(
        db, "member.role_changed",
        workspace_id=workspace.id,
        user_id=membership.user_id,
        resource_type="user",
        resource_id=user_id,
        event_metadata={"new_role": payload.role},
        request=request,
    )
    await db.commit()

    target_user = await db.get(User, user_id)

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return MemberRead(
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=target_membership.role,
        joined_at=target_membership.joined_at,
    )


@router.delete(
    "/{workspace_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    user_id: UUID,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(
        get_workspace_membership
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership

    is_self_removal = user_id == membership.user_id

    if not is_self_removal:
        require_workspace_role(membership, {"owner", "admin"})

    target_membership_statement = select(Membership).where(
        Membership.workspace_id == workspace.id,
        Membership.user_id == user_id,
    )

    target_membership_result = await db.execute(target_membership_statement)
    target_membership = target_membership_result.scalar_one_or_none()

    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    if not is_self_removal:
        if membership.role == "admin" and target_membership.role == "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admins cannot remove owners",
            )

    if target_membership.role == "owner":
        owner_count = await db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.workspace_id == workspace.id,
                Membership.role == "owner",
            )
        )

        if owner_count is None or owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workspace must have at least one owner",
            )

    await db.delete(target_membership)
    await db.commit()

    await log_event(
        db, "member.removed",
        workspace_id=workspace.id,
        user_id=membership.user_id,
        resource_type="user",
        resource_id=user_id,
        request=request,
    )
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{workspace_id}", response_model=WorkspaceRead)
async def update_workspace(
    workspace_id: UUID,
    payload: WorkspaceUpdate,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    
    # Only owners can rename workspaces
    require_workspace_role(membership, {"owner"})
    
    workspace.name = payload.name
    await db.commit()
    await db.refresh(workspace)
    
    return serialize_workspace(workspace, membership.role)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: UUID,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner"})
    
    # Log the deletion
    await log_event(
        db, "workspace.deleted",
        workspace_id=workspace.id,
        user_id=membership.user_id,
        resource_type="workspace",
        resource_id=workspace.id,
        event_metadata={"name": workspace.name},
        request=request,
    )

    # Cleanup related data to avoid foreign key constraint errors
    
    # Get document IDs for this workspace to clean up chunks and versions
    doc_ids = select(Document.id).where(Document.workspace_id == workspace.id)
    
    # Delete document chunks (depends on documents)
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id.in_(doc_ids)))
    
    # Delete document versions (depends on documents)
    await db.execute(delete(DocumentVersion).where(DocumentVersion.document_id.in_(doc_ids)))
    
    # Delete messages (depends on conversations)
    conv_ids = select(Conversation.id).where(Conversation.workspace_id == workspace.id)
    await db.execute(delete(Message).where(Message.conversation_id.in_(conv_ids)))
    
    # Delete conversations (depends on workspaces)
    await db.execute(delete(Conversation).where(Conversation.workspace_id == workspace.id))
    
    # Delete invitations (depends on workspaces)
    await db.execute(delete(Invitation).where(Invitation.workspace_id == workspace.id))
    
    # NEW: Delete share links (depends on workspaces)
    await db.execute(delete(ShareLink).where(ShareLink.workspace_id == workspace.id))
    
    # Delete documents (depends on workspaces, users, folders)
    await db.execute(delete(Document).where(Document.workspace_id == workspace.id))
    
    # Delete folders (depends on workspaces)
    await db.execute(delete(Folder).where(Folder.workspace_id == workspace.id))
    
    # Delete memberships (depends on workspaces)
    await db.execute(delete(Membership).where(Membership.workspace_id == workspace.id))
    
    # Delete audit logs for this workspace
    await db.execute(delete(AuditLog).where(AuditLog.workspace_id == workspace.id))
    
    # Delete the Workspace itself
    await db.delete(workspace)
    await db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)
