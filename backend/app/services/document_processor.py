import uuid
from pypdf import PdfReader
from docx import Document as DocxDocument
import io
from qdrant_client.http.models import PointStruct
from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from app.services.embeddings import get_embeddings_batch

def extract_text(file_bytes: bytes, mime_type: str) -> str:
    # ... (same as before) ...
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
    """Split text into overlapping chunks."""
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

async def index_document(document_id: uuid.UUID, workspace_id: uuid.UUID, text: str):
    """Chunk text, embed, and store in Qdrant."""
    chunks = chunk_text(text)
    if not chunks:
        return

    # Generate embeddings
    vectors = await get_embeddings_batch(chunks)

    # Prepare points for Qdrant
    points = []
    for i, (chunk_content, vector) in enumerate(zip(chunks, vectors)):
        points.append(
            PointStruct(
                id=str(uuid.uuid4()), # Unique ID for the chunk
                vector=vector,
                payload={
                    "document_id": str(document_id),
                    "workspace_id": str(workspace_id),
                    "chunk_index": i,
                    "text": chunk_content
                }
            )
        )

    # Upsert to Qdrant
    qdrant_client.upsert(
        collection_name=COLLECTION_NAME,
        points=points
    )
