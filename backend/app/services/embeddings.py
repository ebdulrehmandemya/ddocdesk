import httpx
from app.core.config import settings

# Ollama runs on port 11434
OLLAMA_URL = "http://localhost:11434/api/embeddings"
MODEL_NAME = "nomic-embed-text"

async def get_embedding(text: str) -> list[float]:
    """Generate an embedding vector for a single text string."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OLLAMA_URL,
            json={"model": MODEL_NAME, "prompt": text}
        )
        response.raise_for_status()
        data = response.json()
        return data["embedding"]

async def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    # For MVP simplicity, we loop. In production, use batch APIs or async concurrency.
    embeddings = []
    for text in texts:
        embeddings.append(await get_embedding(text))
    return embeddings
