from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams
from app.core.config import settings

qdrant_client = QdrantClient(url=settings.QDRANT_URL)

COLLECTION_NAME = "document_chunks"
VECTOR_SIZE = 768 # nomic-embed-text dimension

def ensure_collection_exists():
    collections = [c.name for c in qdrant_client.get_collections().collections]
    if COLLECTION_NAME not in collections:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE)
        )
