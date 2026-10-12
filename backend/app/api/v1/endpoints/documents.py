import uuid
import asyncio
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status, Response
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
from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from fastapi.responses import StreamingResponse
from qdrant_client.http.models import Filter, FieldCondition, MatchValue
from sqlalchemy import select, delete as sql_delete 


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
            
            # Run blocking boto3 call in thread to avoid blocking event loop
            response = await asyncio.to_thread(
                s3_client.get_object, Bucket=BUCKET_NAME, Key=document.minio_key
            )
            file_bytes = response['Body'].read()
            
            # Run blocking PyPDF/Docx call in thread
            text = await asyncio.to_thread(extract_text, file_bytes, document.mime_type)

            await index_document(document.id, document.workspace_id, text, db)

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
    
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Allowed: {ALLOWED_EXTENSIONS}")

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


@router.get("/{workspace_id}/documents/{document_id}/download")
async def download_document(
    workspace_id: uuid.UUID,
    document_id: uuid.UUID,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    
    stmt = select(Document).where(Document.id == document_id, Document.workspace_id == workspace.id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Fetch file from MinIO in a background thread
    def get_file():
        response = s3_client.get_object(Bucket=BUCKET_NAME, Key=doc.minio_key)
        return response['Body'].read()
        
    file_bytes = await asyncio.to_thread(get_file)
    
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.file_name}"'}
    )

@router.delete("/{workspace_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    workspace_id: uuid.UUID,
    document_id: uuid.UUID,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    
    stmt = select(Document).where(Document.id == document_id, Document.workspace_id == workspace.id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Authorization: Owners/Admins can delete anything. Members can only delete their own uploads.
    if membership.role not in {"owner", "admin"} and doc.uploaded_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")

    # 1. Delete from Qdrant (Vectors)
    def delete_vectors():
        qdrant_client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[FieldCondition(key="document_id", match=MatchValue(value=str(document_id)))]
            )
        )
    await asyncio.to_thread(delete_vectors)

    # 2. Delete from MinIO (File)
    def delete_file():
        s3_client.delete_object(Bucket=BUCKET_NAME, Key=doc.minio_key)
    await asyncio.to_thread(delete_file)

    # 3. Delete from PostgreSQL (Metadata & Citations)
    # Note: If you have foreign keys from Messages to Documents, you'd delete them here too.
    await db.delete(doc)
    await db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)
