import uuid
import asyncio
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status, Response, Query
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import StreamingResponse
from qdrant_client.http.models import Filter, FieldCondition, MatchValue
from workers.tasks import process_document, run_document_processing

from app.api.deps import get_workspace_membership, get_current_user, require_workspace_role
from app.db.session import get_db, SessionLocal
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.models.document import Document, DocumentStatus, DocumentChunk
from app.models.folder import Folder
from app.schemas.document import DocumentRead
from app.services.minio_client import s3_client
from app.services.document_processor import extract_text, index_document
from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from fastapi import Request
from app.services.audit import log_event
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
BUCKET_NAME = "ddocdesk-docs"
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}

async def process_document_task(document_id: uuid.UUID):
    """Background task to download from MinIO, extract text, and update DB."""
    async with SessionLocal() as db:
        document = await db.get(Document, document_id)
        if not document:
            return
            
        try:
            document.status = DocumentStatus.PROCESSING
            await db.commit()
            
            response = await asyncio.to_thread(
                s3_client.get_object, Bucket=BUCKET_NAME, Key=document.minio_key
            )
            file_bytes = response['Body'].read()
            text = await asyncio.to_thread(extract_text, file_bytes, document.mime_type)
            await index_document(document.id, document.workspace_id, text, db)

            document.extracted_text = text
            document.status = DocumentStatus.READY
            await db.commit()
            
        except Exception as e:
            import traceback
            print(f"❌ Processing failed for {document_id}: {e}")
            print(traceback.format_exc())
            document.status = DocumentStatus.FAILED
            await db.commit()

@router.post("/{workspace_id}/documents", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    workspace_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(...),
    folder_id: uuid.UUID | None = Query(None), 
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner", "admin", "member"})
    
    if not file.filename or not file.content_type:
         raise HTTPException(status_code=400, detail="Invalid file metadata")
         
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed.")

    if folder_id:
        folder_stmt = select(Folder).where(Folder.id == folder_id, Folder.workspace_id == workspace.id)
        folder_res = await db.execute(folder_stmt)
        if not folder_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Folder not found in this workspace")

    contents = await file.read()
    size_bytes = len(contents)
    
    folder_path = str(folder_id) if folder_id else "root"
    minio_key = f"{workspace_id}/{folder_path}/{uuid.uuid4()}/{file.filename}"
    
    await asyncio.to_thread(
        s3_client.put_object, Bucket=BUCKET_NAME, Key=minio_key, Body=contents, ContentType=file.content_type
    )
    
    document = Document(
        workspace_id=workspace_id,
        folder_id=folder_id,
        uploaded_by_id=current_user.id,
        file_name=file.filename,
        mime_type=file.content_type,
        size_bytes=size_bytes,
        minio_key=minio_key,
        status=DocumentStatus.PENDING
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    await log_event(
        db, "document.uploaded",
        workspace_id=workspace_id,
        user_id=current_user.id,
        resource_type="document",
        resource_id=document.id,
        event_metadata={"file_name": document.file_name, "size_bytes": size_bytes},
        request=request,
    )
    await db.commit()

    # Was: background_tasks.add_task(process_document_task, document.id)

    try:
        # Preferred path: durable, retryable, survives API restarts
        process_document.delay(str(document.id))
    except Exception as exc:
        # Worker/Redis unreachable — degrade gracefully instead of
        # leaving the document stuck in PENDING forever.
        logger.warning("Celery unavailable, falling back to BackgroundTasks: %s", exc)
        background_tasks.add_task(run_document_processing, str(document.id))

    return document


@router.get("/{workspace_id}/documents", response_model=list[DocumentRead])
async def list_documents(
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    folder_id: uuid.UUID | None = None,
    root_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    stmt = select(Document).where(Document.workspace_id == workspace.id)

    if root_only:
        stmt = stmt.where(Document.folder_id.is_(None))
    elif folder_id:
        stmt = stmt.where(Document.folder_id == folder_id)

    stmt = stmt.order_by(Document.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{workspace_id}/documents/{document_id}/download")
async def download_document(
    workspace_id: uuid.UUID,
    document_id: uuid.UUID,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    stmt = select(Document).where(Document.id == document_id, Document.workspace_id == workspace.id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    def get_file():
        return s3_client.get_object(Bucket=BUCKET_NAME, Key=doc.minio_key)['Body'].read()
        
    file_bytes = await asyncio.to_thread(get_file)

    await log_event(
        db, "document.downloaded",
        workspace_id=workspace_id,
        user_id=membership.user_id,
        resource_type="document",
        resource_id=document_id,
        event_metadata={"file_name": doc.file_name},
        request=request,
    )
    await db.commit()

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.file_name}"'}
    )

@router.delete("/{workspace_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    workspace_id: uuid.UUID,
    document_id: uuid.UUID,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    stmt = select(Document).where(Document.id == document_id, Document.workspace_id == workspace.id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if membership.role not in {"owner", "admin"} and doc.uploaded_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")

    await log_event(
        db, "document.deleted",
        workspace_id=workspace_id,
        user_id=current_user.id,
        resource_type="document",
        resource_id=document_id,
        event_metadata={"file_name": doc.file_name},
        request=request,
    )

    def delete_vectors():
        qdrant_client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=str(document_id)))])
        )
    await asyncio.to_thread(delete_vectors)

    def delete_file():
        s3_client.delete_object(Bucket=BUCKET_NAME, Key=doc.minio_key)
    await asyncio.to_thread(delete_file)

    await db.execute(sql_delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
    await db.delete(doc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)



@router.get("/{workspace_id}/documents/{document_id}/preview")
async def preview_document(
    workspace_id: uuid.UUID,
    document_id: uuid.UUID,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    
    stmt = select(Document).where(
        Document.id == document_id, 
        Document.workspace_id == workspace.id
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if doc.status != DocumentStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, 
            detail="Document is still processing"
        )
    
    # PDF: stream the original file for native browser rendering
    if doc.mime_type == "application/pdf":
        def get_file():
            response = s3_client.get_object(Bucket=BUCKET_NAME, Key=doc.minio_key)
            return response['Body'].read()
        
        file_bytes = await asyncio.to_thread(get_file)
        
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{doc.file_name}"',
                "Cache-Control": "private, max-age=3600",
            }
        )
    
    # TXT: stream the original text file
    elif doc.mime_type == "text/plain":
        def get_file():
            response = s3_client.get_object(Bucket=BUCKET_NAME, Key=doc.minio_key)
            return response['Body'].read()
        
        file_bytes = await asyncio.to_thread(get_file)
        
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type="text/plain; charset=utf-8",
            headers={
                "Content-Disposition": f'inline; filename="{doc.file_name}"',
                "Cache-Control": "private, max-age=3600",
            }
        )
    
    # DOCX: return the extracted text (browser can't render DOCX natively)
    elif doc.mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        if not doc.extracted_text:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Document text not yet extracted"
            )
        
        return StreamingResponse(
            io.BytesIO(doc.extracted_text.encode('utf-8')),
            media_type="text/plain; charset=utf-8",
            headers={
                "Content-Disposition": f'inline; filename="{doc.file_name}.txt"',
                "Cache-Control": "private, max-age=3600",
            }
        )
    
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Preview not supported for this file type"
        )
