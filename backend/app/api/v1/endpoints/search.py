import asyncio
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from qdrant_client.http.models import Filter, FieldCondition, MatchValue
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request
from app.services.audit import log_event

from app.db.session import get_db, SessionLocal
from app.api.deps import get_workspace_membership
from app.models.workspace import Workspace, Membership
from app.models.document import DocumentChunk, Document
from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from app.services.embeddings import get_embedding

router = APIRouter()

class SearchQuery(BaseModel):
    query: str
    limit: int = 5

class SearchResult(BaseModel):
    document_id: UUID
    file_name: str
    chunk_text: str
    chunk_index: int
    score: float
    match_source: str  # "semantic", "keyword", or "both"

def reciprocal_rank_fusion(semantic_results, keyword_results, k=60):
    """Combines two ranked lists into one using RRF."""
    scores = {}
    semantic_ids = set()
    keyword_ids = set()
    
    # Track which source each chunk came from
    for rank, point in enumerate(semantic_results):
        chunk_id = point.id
        semantic_ids.add(chunk_id)
        if chunk_id not in scores:
            scores[chunk_id] = {
                "score": 0.0, 
                "text": point.payload["text"], 
                "doc_id": point.payload["document_id"],
                "chunk_index": point.payload.get("chunk_index", 0)
            }
        scores[chunk_id]["score"] += 1.0 / (k + rank + 1)
        
    for rank, chunk in enumerate(keyword_results):
        chunk_id = str(chunk.id)
        keyword_ids.add(chunk_id)
        if chunk_id not in scores:
            scores[chunk_id] = {
                "score": 0.0, 
                "text": chunk.text, 
                "doc_id": str(chunk.document_id),
                "chunk_index": chunk.chunk_index
            }
        scores[chunk_id]["score"] += 1.0 / (k + rank + 1)

    # Determine match source
    for chunk_id in scores:
        if chunk_id in semantic_ids and chunk_id in keyword_ids:
            scores[chunk_id]["match_source"] = "both"
        elif chunk_id in semantic_ids:
            scores[chunk_id]["match_source"] = "semantic"
        else:
            scores[chunk_id]["match_source"] = "keyword"

    return sorted(scores.items(), key=lambda x: x[1]["score"], reverse=True)

@router.post("/{workspace_id}/search", response_model=list[SearchResult])
async def search_documents(
    workspace_id: UUID,
    query: SearchQuery,
    request: Request,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    workspace, membership = workspace_membership
    
    # 1. Semantic Search (Qdrant)
    query_vector = await get_embedding(query.query)
    
    def _semantic_search():
        return qdrant_client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            query_filter=Filter(
                must=[FieldCondition(key="workspace_id", match=MatchValue(value=str(workspace_id)))]
            ),
            limit=query.limit * 2
        )
        
    semantic_res = await asyncio.to_thread(_semantic_search)
    
    # 2. Keyword Search (PostgreSQL Full-Text Search)
    ts_vector = func.to_tsvector('english', DocumentChunk.text)
    ts_query = func.plainto_tsquery('english', query.query)
    
    keyword_stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.workspace_id == workspace_id)
        .where(ts_vector.op('@@')(ts_query))
        .order_by(func.ts_rank(ts_vector, ts_query).desc())
        .limit(query.limit * 2)
    )
    keyword_res = await db.execute(keyword_stmt)
    keyword_chunks = keyword_res.scalars().all()
    
    # 3. Fuse Results
    fused_results = reciprocal_rank_fusion(semantic_res.points, keyword_chunks)
    
    # 4. Fetch document file names
    doc_ids = list(set([UUID(item[1]["doc_id"]) for item in fused_results[:query.limit]]))
    docs_stmt = select(Document).where(Document.id.in_(doc_ids))
    docs_res = await db.execute(docs_stmt)
    docs_map = {str(d.id): d.file_name for d in docs_res.scalars().all()}

    
    await log_event(
        db, "search.performed",
        workspace_id=workspace.id,
        user_id=membership.user_id,
        event_metadata={"query": query.query[:200], "results": len(final_results)},
        request=request,
    )
    await db.commit()

    # 5. Return top N with file names
    return [
        SearchResult(
            document_id=UUID(item[1]["doc_id"]),
            file_name=docs_map.get(item[1]["doc_id"], "Unknown Document"),
            chunk_text=item[1]["text"],
            chunk_index=item[1]["chunk_index"],
            score=item[1]["score"],
            match_source=item[1]["match_source"]
        )
        for item in fused_results[:query.limit]
    ]
