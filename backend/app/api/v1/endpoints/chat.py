import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from qdrant_client.http.models import Filter, FieldCondition, MatchValue

from app.api.deps import get_workspace_membership, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Workspace, Membership
from app.models.chat import Conversation, Message
from app.models.document import Document
from app.schemas.chat import ChatRequest, MessageRead, ConversationRead, Citation
from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from app.services.embeddings import get_embedding
from app.services.llm import generate_answer

router = APIRouter()

@router.post("/{workspace_id}/chat", response_model=MessageRead)
async def chat_with_documents(
    workspace_id: uuid.UUID,
    payload: ChatRequest,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    
    # 1. Handle Conversation
    if payload.conversation_id:
        conv = await db.get(Conversation, payload.conversation_id)
        if not conv or conv.workspace_id != workspace_id or conv.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        # Create new conversation with first 50 chars of query as title
        conv = Conversation(
            workspace_id=workspace_id, 
            user_id=current_user.id, 
            title=payload.query[:50]
        )
        db.add(conv)
        await db.flush()
        
    # 2. Save User Message
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=payload.query
    )
    db.add(user_msg)
    await db.flush()
    
    # 3. RAG: Retrieve Context
    query_vector = await get_embedding(payload.query)
    
    def _search():
        return qdrant_client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            query_filter=Filter(
                must=[FieldCondition(key="workspace_id", match=MatchValue(value=str(workspace_id)))]
            ),
            limit=5 # Top 5 chunks
        )
        
    search_result = await asyncio.to_thread(_search)
    
    context_str = ""
    citations = []
    
    if search_result.points:
        # Fetch document names for citations
        doc_ids = list(set([uuid.UUID(p.payload["document_id"]) for p in search_result.points]))
        docs_stmt = select(Document).where(Document.id.in_(doc_ids))
        docs_res = await db.execute(docs_stmt)
        docs_map = {str(d.id): d.file_name for d in docs_res.scalars().all()}
        
        for point in search_result.points:
            doc_id = point.payload["document_id"]
            chunk_idx = point.payload["chunk_index"]
            text = point.payload["text"]
            file_name = docs_map.get(doc_id, "Unknown Document")
            
            context_str += f"\n[Source: {file_name}]\n{text}\n"
            citations.append({
                "document_id": doc_id,
                "chunk_index": chunk_idx,
                "text": text,
                "file_name": file_name
            })
            
    # 4. Generate Answer
    if not context_str:
        answer_content = "I don't know based on the provided documents. No relevant context was found."
    else:
        system_prompt = (
            "You are a helpful document assistant. Answer the user's question using ONLY the provided context. "
            "If the context doesn't contain the answer, say 'I don't know based on the provided documents.' "
            "Do not make up information."
        )
        answer_content = await generate_answer(system_prompt, f"Context:\n{context_str}\n\nQuestion: {payload.query}")
        
    # 5. Save Assistant Message
    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=answer_content,
        citations=citations
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)
    
    return assistant_msg

@router.get("/{workspace_id}/conversations", response_model=list[ConversationRead])
async def list_conversations(
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    stmt = select(Conversation).where(
        Conversation.workspace_id == workspace.id,
        Conversation.user_id == current_user.id
    ).order_by(Conversation.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/{workspace_id}/conversations/{conversation_id}/messages", response_model=list[MessageRead])
async def list_messages(
    conversation_id: uuid.UUID,
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_membership
    conv = await db.get(Conversation, conversation_id)
    if not conv or conv.workspace_id != workspace.id or conv.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    stmt = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.asc())
    res = await db.execute(stmt)
    return res.scalars().all()
