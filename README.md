# dDocDesk MVP

A self-hosted document workspace with hybrid search and cited AI chat.

## Local Development
1. Start infrastructure: `docker compose up -d`
2. Start Backend: `cd backend && uvicorn app.main:app --reload`
3. Start Frontend: `cd frontend && npm run dev`
4. Open http://localhost:3000 and log in with `admin / admin`.

## Architecture
- **Frontend:** Next.js 14 (App Router)
- **Backend:** FastAPI (Python 3.12+)
- **Identity:** Keycloak (OIDC)
- **Storage:** MinIO (S3-compatible)
- **Vector DB:** Qdrant
- **AI:** Ollama (nomic-embed-text, llama3.2:3b)
