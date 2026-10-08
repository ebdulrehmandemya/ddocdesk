import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_workspace_membership, get_current_user, require_workspace_role
from app.db.session import get_db, SessionLocal
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.models.document import Document, DocumentStatus
from app.schemas.document import DocumentRead
from app.services.minio_client import s3_client
from app.services.document_processor import extract_text
from app.services.document_processor import index_document


router = APIRouter()
BUCKET_NAME = "ddocdesk-docs"

async def process_document_task(document_id: uuid.UUID):
    """Background task to download from MinIO, extract text, and update DB."""
    async with SessionLocal() as db:
        document = await db.get(Document, document_id)
        if not document:
            return
            
        try:
            document.status = DocumentStatus.PROCESSING
            await db.commit()
            
            # Run blocking boto3 call in thread to avoid blocking event loop
            response = await asyncio.to_thread(
                s3_client.get_object, Bucket=BUCKET_NAME, Key=document.minio_key
            )
            file_bytes = response['Body'].read()
            
            # Run blocking PyPDF/Docx call in thread
            text = await asyncio.to_thread(extract_text, file_bytes, document.mime_type)

            await index_document(document.id, document.workspace_id, text)

            document.extracted_text = text
            document.status = DocumentStatus.READY
            await db.commit()
            
        except Exception as e:
            print(f"Processing failed for {document_id}: {e}")
            document.status = DocumentStatus.FAILED
            await db.commit()

@router.post(
    "/{workspace_id}/documents",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED
)
async def upload_document(
    workspace_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    require_workspace_role(membership, {"owner", "admin", "member"})
    
    if not file.filename or not file.content_type:
         raise HTTPException(status_code=400, detail="Invalid file metadata")
         
    contents = await file.read()
    size_bytes = len(contents)
    
    # Generate a unique key: workspace_id/uuid/filename
    minio_key = f"{workspace_id}/{uuid.uuid4()}/{file.filename}"
    
    # Upload to MinIO (run in thread to avoid blocking)
    await asyncio.to_thread(
        s3_client.put_object,
        Bucket=BUCKET_NAME,
        Key=minio_key,
        Body=contents,
        ContentType=file.content_type
    )
    
    document = Document(
        workspace_id=workspace_id,
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
    
    # Trigger background processing
    background_tasks.add_task(process_document_task, document.id)
    
    return document

@router.get("/{workspace_id}/documents", response_model=list[DocumentRead])
async def list_documents(
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    statement = select(Document).where(Document.workspace_id == workspace.id).order_by(Document.created_at.desc())
    result = await db.execute(statement)
    return result.scalars().all()
