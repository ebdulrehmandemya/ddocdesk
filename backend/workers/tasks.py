import asyncio
import logging
import uuid

from celery.exceptions import SoftTimeLimitExceeded

from workers.celery_app import celery_app
from workers.db import create_worker_engine, worker_session
from app.models.document import Document, DocumentStatus
from app.services.minio_client import s3_client
from app.services.document_processor import extract_text, index_document

logger = logging.getLogger(__name__)

BUCKET_NAME = "ddocdesk-docs"


async def _set_status(document_id: uuid.UUID, status: DocumentStatus, error: str | None = None):
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
    """
    Core processing pipeline. Async and Celery-agnostic so the API can
    reuse it as a fallback when the worker is unreachable.
    """
    doc_uuid = uuid.UUID(document_id)
    engine = create_worker_engine()

    try:
        async with worker_session(engine)() as db:
            document = await db.get(Document, doc_uuid)
            if not document:
                logger.warning("Document %s vanished before processing", document_id)
                return {"document_id": document_id, "status": "missing"}

            document.status = DocumentStatus.PROCESSING
            await db.commit()

            try:
                response = await asyncio.to_thread(
                    s3_client.get_object,
                    Bucket=BUCKET_NAME,
                    Key=document.minio_key,
                )
                file_bytes = response["Body"].read()

                text = await asyncio.to_thread(
                    extract_text, file_bytes, document.mime_type
                )

                await index_document(document.id, document.workspace_id, text, db)

                document.extracted_text = text
                document.status = DocumentStatus.READY
                await db.commit()

                logger.info(
                    "Processed %s (%s chars)", document_id, len(text or "")
                )
                return {"document_id": document_id, "status": "ready", "chars": len(text or "")}

            except Exception as exc:
                logger.exception("Extraction failed for %s", document_id)
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
        logger.error("Document %s exceeded soft time limit", document_id)
        asyncio.run(_set_status(uuid.UUID(document_id), DocumentStatus.FAILED))
        raise

    except Exception as exc:
        if self.request.retries >= self.max_retries:
            logger.error(
                "Document %s failed permanently after %d retries",
                document_id, self.request.retries,
            )
            asyncio.run(_set_status(uuid.UUID(document_id), DocumentStatus.FAILED))
            raise

        # Exponential backoff: 30s, 60s, 120s
        countdown = self.default_retry_delay * (2 ** self.request.retries)
        logger.warning(
            "Document %s failed, retrying in %ss (attempt %d/%d)",
            document_id, countdown, self.request.retries + 1, self.max_retries + 1,
        )
        raise self.retry(exc=exc, countdown=countdown)
