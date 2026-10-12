import uuid
from pypdf import PdfReader
from docx import Document as DocxDocument
import io
from qdrant_client.http.models import PointStruct
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from app.services.embeddings import get_embeddings_batch
from app.models.document import DocumentChunk

def extract_text(file_bytes: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        reader = PdfReader(io.BytesIO(file_bytes))
        return "\n".join([page.extract_text() or "" for page in reader.pages]).strip()
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        doc = DocxDocument(io.BytesIO(file_bytes))
        return "\n".join([p.text for p in doc.paragraphs]).strip()
    elif mime_type == "text/plain":
        return file_bytes.decode("utf-8", errors="replace")
    raise ValueError(f"Unsupported mime type: {mime_type}")

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    if not text: return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

async def index_document(document_id: uuid.UUID, workspace_id: uuid.UUID, text: str, db: AsyncSession):
    """Chunk text, save to Postgres for keyword search, embed, and store in Qdrant."""
    chunks = chunk_text(text)
    if not chunks:
        return

    # 1. Save chunks to PostgreSQL for Full-Text Search
    db_chunks = [
        DocumentChunk(
            document_id=document_id, 
            workspace_id=workspace_id, 
            chunk_index=i, 
            text=chunk
        ) for i, chunk in enumerate(chunks)
    ]
    db.add_all(db_chunks)
    await db.flush() # Generates the UUIDs for the chunks

    # 2. Generate embeddings
    vectors = await get_embeddings_batch(chunks)

    # 3. Prepare points for Qdrant
    points = []
    for db_chunk, vector in zip(db_chunks, vectors):
        points.append(
            PointStruct(
                id=str(db_chunk.id), # Use DB chunk ID as Qdrant point ID
                vector=vector,
                payload={
                    "document_id": str(document_id),
                    "workspace_id": str(workspace_id),
                    "chunk_index": db_chunk.chunk_index,
                    "text": db_chunk.text
                }
            )
        )

    # 4. Upsert to Qdrant
    qdrant_client.upsert(
        collection_name=COLLECTION_NAME,
        points=points
    )
