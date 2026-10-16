import httpx

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
CHAT_MODEL = "llama3.2:3b"

async def generate_answer(system_prompt: str, user_query: str) -> str:
    """Generate a response from the local LLM."""
    payload = {
        "model": CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query}
        ],
        "stream": False,
        "options": {
            "temperature": 0.1 # Keep it factual for RAG
        }
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(OLLAMA_CHAT_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"]


async def generate_summary(text: str, max_chars: int = 4000) -> str:
    """Generate a brief summary of the text using the local LLM."""
    # Truncate text if it's too long for the context window
    truncated = text[:max_chars]
    
    system_prompt = (
        "You are a document summarizer. Provide a concise, 2-3 sentence summary "
        "of the provided text. Focus on the main topic and key points. "
        "Do not include introductory phrases like 'This document is about...'."
    )
    
    payload = {
        "model": CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": truncated}
        ],
        "stream": False,
        "options": {"temperature": 0.2}
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(OLLAMA_CHAT_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"]
