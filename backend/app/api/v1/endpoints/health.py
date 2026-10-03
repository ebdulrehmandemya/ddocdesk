# backend/app/api/v1/endpoints/health.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from botocore.exceptions import ClientError
from qdrant_client.http.exceptions import UnexpectedResponse

from app.db.session import get_db
from app.services.minio_client import s3_client
from app.services.qdrant_client import qdrant_client

router = APIRouter()

@router.get("/healthz", tags=["Health"])
async def liveness():
    """Simple liveness probe."""
    return {"status": "alive"}

@router.get("/readyz", tags=["Health"])
async def readiness(db: AsyncSession = Depends(get_db)):
    """Readiness probe checking all dependencies."""
    checks = {}
    is_healthy = True

    # 1. Check Postgres
    try:
        await db.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as e:
        checks["postgres"] = f"error: {str(e)}"
        is_healthy = False

    # 2. Check MinIO
    try:
        s3_client.list_buckets()
        checks["minio"] = "ok"
    except ClientError as e:
        checks["minio"] = f"error: {str(e)}"
        is_healthy = False

    # 3. Check Qdrant
    try:
        qdrant_client.get_collections()
        checks["qdrant"] = "ok"
    except Exception as e:
        checks["qdrant"] = f"error: {str(e)}"
        is_healthy = False

    if not is_healthy:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "unhealthy", "checks": checks}
        )

    return {"status": "healthy", "checks": checks}
