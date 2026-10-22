import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from celery.exceptions import SoftTimeLimitExceeded
from docx import document
from sqlalchemy import select

from workers.celery_app import celery_app
from workers.db import create_worker_engine, worker_session
from app.models.document import Document, DocumentStatus
from app.services.minio_client import s3_client
from app.services.document_processor import extract_text, index_document
from app.services.llm import generate_summary  # <-- NEW IMPORT

logger = logging.getLogger(__name__)
BUCKET_NAME = "ddocdesk-docs"


async def _set_status(document_id: uuid.UUID, status: DocumentStatus):
    engine = create_worker_engine()
    try:
        async with worker_session(engine)() as db:
            doc = await db.get(Document, document_id)
            if doc:
                doc.status = status
                await db.commit()
    finally:
        await engine.dispose()


async def run_document_processing(document_id: str) -> dict:
    doc_uuid = uuid.UUID(document_id)
    engine = create_worker_engine()

    try:
        async with worker_session(engine)() as db:
            document = await db.get(Document, doc_uuid)
            if not document:
                return {"document_id": document_id, "status": "missing"}

            document.status = DocumentStatus.PROCESSING
            await db.commit()

            try:
                response = await asyncio.to_thread(
                    s3_client.get_object, Bucket=BUCKET_NAME, Key=document.minio_key
                )
                file_bytes = response["Body"].read()
                text = await asyncio.to_thread(
                    extract_text, 
                    file_bytes, 
                    document.mime_type,
                    document.file_name,  # <-- Pass the filename for extension-based detection
                )

                # Detect and save the language (for audio files)
                if document.mime_type.startswith(("audio/", "video/")):
                    # Extract language from the transcription metadata
                    # This is a simplified version - you'd need to return the language from transcribe_audio
                    pass


                # NEW: Generate AI Summary
                summary = None
                if text and len(text.strip()) > 50:
                    try:
                        summary = await generate_summary(text)
                    except Exception as e:
                        logger.warning("Failed to generate summary for %s: %s", document_id, e)

                await index_document(document.id, document.workspace_id, text, db)

                document.extracted_text = text
                document.summary = summary
                document.status = DocumentStatus.READY
                await db.commit()

                return {"document_id": document_id, "status": "ready"}

            except Exception:
                logger.exception("Processing failed for %s", document_id)
                document.status = DocumentStatus.FAILED
                await db.commit()
                raise
    finally:
        await engine.dispose()


@celery_app.task(
    bind=True,
    name="workers.process_document",
    max_retries=3,
    default_retry_delay=30,
)
def process_document(self, document_id: str):
    try:
        return asyncio.run(run_document_processing(document_id))
    except SoftTimeLimitExceeded:
        asyncio.run(_set_status(uuid.UUID(document_id), DocumentStatus.FAILED))
        raise
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            asyncio.run(_set_status(uuid.UUID(document_id), DocumentStatus.FAILED))
            raise
        countdown = self.default_retry_delay * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)


# ============================================================================
# NEW: The Stuck-Document Reaper
# ============================================================================

@celery_app.task(name="workers.reap_stuck_documents")
def reap_stuck_documents():
    """Find documents stuck in PROCESSING for > 30 minutes and requeue them."""
    async def _reap():
        engine = create_worker_engine()
        try:
            async with worker_session(engine)() as db:
                threshold = datetime.now(timezone.utc) - timedelta(minutes=30)
                stmt = select(Document).where(
                    Document.status == DocumentStatus.PROCESSING,
                    Document.updated_at < threshold
                )
                result = await db.execute(stmt)
                stuck_docs = result.scalars().all()
                
                count = 0
                for doc in stuck_docs:
                    logger.warning("Reaping stuck document %s (stuck since %s)", doc.id, doc.updated_at)
                    process_document.apply_async(args=[str(doc.id)])
                    count += 1
                    
                if count > 0:
                    logger.info("Requeued %d stuck documents", count)
                return count
        finally:
            await engine.dispose()

    return asyncio.run(_reap())
