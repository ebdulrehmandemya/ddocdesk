# backend/app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from botocore.exceptions import ClientError

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import engine
from app.models import Base
from app.services.minio_client import s3_client
from app.services.qdrant_client import ensure_collection_exists
from fastapi.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Create DB tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # 2. Ensure MinIO bucket exists
    bucket_name = "ddocdesk-docs"
    try:
        s3_client.head_bucket(Bucket=bucket_name)
    except ClientError:
        s3_client.create_bucket(Bucket=bucket_name)
        
    # 3. Ensure Qdrant collection exists
    ensure_collection_exists()
    
    yield

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)
app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"], # Restrict to Next.js frontend
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.include_router(api_router, prefix=settings.API_V1_STR)
