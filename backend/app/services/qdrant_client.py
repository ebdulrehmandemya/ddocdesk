# backend/app/services/qdrant_client.py
from qdrant_client import QdrantClient
from app.core.config import settings

qdrant_client = QdrantClient(url=settings.QDRANT_URL)
