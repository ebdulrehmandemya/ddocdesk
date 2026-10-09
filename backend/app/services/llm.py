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
