from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


def create_worker_engine():
    """
    NullPool ensures no connection is reused across asyncio loops.
    Celery runs each task in a fresh event loop, and pooled asyncpg
    connections are bound to the loop that created them.
    """
    return create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
        future=True,
    )


def worker_session(engine):
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
