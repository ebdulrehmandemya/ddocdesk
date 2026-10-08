import asyncio
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from qdrant_client.http.models import Filter, FieldCondition, MatchValue

from app.api.deps import get_workspace_membership
from app.models.workspace import Workspace, Membership
from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from app.services.embeddings import get_embedding

router = APIRouter()

class SearchQuery(BaseModel):
    query: str
    limit: int = 5

class SearchResult(BaseModel):
    document_id: UUID
    chunk_text: str
    score: float

@router.post("/{workspace_id}/search", response_model=list[SearchResult])
async def search_documents(
    workspace_id: UUID,
    query: SearchQuery,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
):
    workspace, _ = workspace_membership
    
    # 1. Embed the query
    query_vector = await get_embedding(query.query)
    
    # 2. Search Qdrant with Workspace Filter
    # We wrap the blocking synchronous Qdrant call in asyncio.to_thread
    def _search():
        return qdrant_client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key="workspace_id",
                        match=MatchValue(value=str(workspace_id))
                    )
                ]
            ),
            limit=query.limit
        )
        
    search_result = await asyncio.to_thread(_search)
    
    # 3. Format the response from the .points attribute
    return [
        SearchResult(
            document_id=UUID(hit.payload["document_id"]),
            chunk_text=hit.payload["text"],
            score=hit.score
        )
        for hit in search_result.points
    ]
