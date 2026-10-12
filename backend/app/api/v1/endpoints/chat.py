import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from qdrant_client.http.models import Filter, FieldCondition, MatchValue, MatchAny

from app.api.deps import get_workspace_membership, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Workspace, Membership
from app.models.chat import Conversation, Message
from app.models.document import Document, DocumentStatus
from app.schemas.chat import ChatRequest, MessageRead, ConversationRead, Citation
from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from app.services.embeddings import get_embedding
from app.services.llm import generate_answer

router = APIRouter()


@router.get("/{workspace_id}/chat/documents")
async def list_chat_eligible_documents(
    workspace_membership: tuple[Workspace, Membership] = Depends(get_workspace_membership),
    db: AsyncSession = Depends(get_db),
):
    """Return only documents that are ready for AI chat."""
    workspace, _ = workspace_membership

    stmt = (
        select(Document)
        .where(
            Document.workspace_id == workspace.id,
            Document.status == DocumentStatus.READY,
        )
        .order_by(Document.created_at.desc())
    )
    result = await db.execute(stmt)
    docs = result.scalars().all()

    return [
        {"id": str(d.id), "file_name": d.file_name, "mime_type": d.mime_type}
        for d in docs
    ]


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

    # Build Qdrant filter
    must_conditions = [
        FieldCondition(key="workspace_id", match=MatchValue(value=str(workspace_id)))
    ]

    # If user selected specific documents, add document_id filter
    # If user selected specific documents, add document_id filter
    if payload.document_ids:
        doc_id_strs = [str(doc_id) for doc_id in payload.document_ids]
        
        if len(doc_id_strs) == 1:
            must_conditions.append(
                FieldCondition(key="document_id", match=MatchValue(value=doc_id_strs[0]))
            )
        else:
            must_conditions.append(
                FieldCondition(key="document_id", match=MatchAny(any=doc_id_strs))
            )

    def _search():
        return qdrant_client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            query_filter=Filter(must=must_conditions),
            limit=5
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

            context_str += f"\n[Source: {file_name}, Chunk {chunk_idx}]\n{text}\n"
            citations.append({
                "document_id": doc_id,
                "chunk_index": chunk_idx,
                "text": text,
                "file_name": file_name
            })

    # 4. Generate Answer
    if not context_str:
        answer_content = (
            "I couldn't find relevant information in the selected documents. "
            "Try selecting different documents or rephrasing your question."
        )
    else:
        scope_info = ""
        if payload.document_ids:
            scope_info = f" You are searching within {len(payload.document_ids)} specific document(s)."
        
        system_prompt = (
            "You are a helpful document assistant for dDocDesk. "
            "Answer the user's question using ONLY the provided context. "
            "If the context doesn't contain the answer, say 'I don't know based on the provided documents.' "
            "Do not make up information. Be concise and accurate."
            + scope_info
        )
        answer_content = await generate_answer(
            system_prompt,
            f"Context:\n{context_str}\n\nQuestion: {payload.query}"
        )

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
    stmt = (
        select(Conversation)
        .where(
            Conversation.workspace_id == workspace.id,
            Conversation.user_id == current_user.id,
        )
        .order_by(Conversation.created_at.desc())
    )
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

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()
