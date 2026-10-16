import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_workspace_membership, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Workspace, Membership
from app.models.folder import Folder
from app.models.document import Document
from app.schemas.folder import FolderCreate, FolderUpdate, FolderRead, DocumentMove
from app.services.audit import log_event

router = APIRouter()

@router.post("/{workspace_id}/folders", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
async def create_folder(
    workspace_id: uuid.UUID,
    payload: FolderCreate,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    folder = Folder(workspace_id=workspace.id, name=payload.name, created_by_id=current_user.id)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)

    return FolderRead(
        id=folder.id, workspace_id=folder.workspace_id, name=folder.name,
        created_by_id=folder.created_by_id, created_at=folder.created_at, document_count=0,
    )

@router.get("/{workspace_id}/folders", response_model=list[FolderRead])
async def list_folders(
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    stmt = (
        select(Folder, func.count(Document.id).label("document_count"))
        .outerjoin(Document, Document.folder_id == Folder.id)
        .where(Folder.workspace_id == workspace.id)
        .group_by(Folder.id)
        .order_by(Folder.created_at.desc())
    )
    result = await db.execute(stmt)
    return [
        FolderRead(
            id=f.id, workspace_id=f.workspace_id, name=f.name,
            created_by_id=f.created_by_id, created_at=f.created_at, document_count=count,
        )
        for f, count in result.all()
    ]

@router.patch("/{workspace_id}/folders/{folder_id}", response_model=FolderRead)
async def rename_folder(
    workspace_id: uuid.UUID, folder_id: uuid.UUID, payload: FolderUpdate,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    stmt = select(Folder).where(Folder.id == folder_id, Folder.workspace_id == workspace.id)
    folder = (await db.execute(stmt)).scalar_one_or_none()
    if not folder: raise HTTPException(status_code=404, detail="Folder not found")

    folder.name = payload.name
    await db.commit()
    await db.refresh(folder)

    count = (await db.execute(select(func.count(Document.id)).where(Document.folder_id == folder.id))).scalar() or 0
    return FolderRead(
        id=folder.id, workspace_id=folder.workspace_id, name=folder.name,
        created_by_id=folder.created_by_id, created_at=folder.created_at, document_count=count,
    )

@router.delete("/{workspace_id}/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    workspace_id: uuid.UUID, folder_id: uuid.UUID,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    stmt = select(Folder).where(Folder.id == folder_id, Folder.workspace_id == workspace.id)
    folder = (await db.execute(stmt)).scalar_one_or_none()
    if not folder: raise HTTPException(status_code=404, detail="Folder not found")

    docs = (await db.execute(select(Document).where(Document.folder_id == folder.id))).scalars().all()
    for doc in docs: doc.folder_id = None

    await db.delete(folder)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.patch("/{workspace_id}/documents/{document_id}/move", status_code=status.HTTP_200_OK)
async def move_document(
    workspace_id: uuid.UUID, document_id: uuid.UUID, payload: DocumentMove,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    stmt = select(Document).where(Document.id == document_id, Document.workspace_id == workspace.id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc: raise HTTPException(status_code=404, detail="Document not found")

    if payload.folder_id:
        target = (await db.execute(select(Folder).where(Folder.id == payload.folder_id, Folder.workspace_id == workspace.id))).scalar_one_or_none()
        if not target: raise HTTPException(status_code=404, detail="Target folder not found")
        doc.folder_id = payload.folder_id
    else:
        doc.folder_id = None

    await db.commit()
    await db.refresh(doc)

    await log_event(
        db, "document.moved",
        workspace_id=workspace.id,
        user_id=membership.user_id,
        resource_type="document",
        resource_id=doc.id,
        event_metadata={"to_folder_id": str(doc.folder_id) if doc.folder_id else None},
        request=request,
    )
    await db.commit()

    return {"id": str(doc.id), "folder_id": str(doc.folder_id) if doc.folder_id else None}
