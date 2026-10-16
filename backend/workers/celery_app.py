from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "ddocdesk",
    broker=settings.REDIS_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["workers.tasks"],
)

celery_app.conf.update(
    # Serialize as JSON — human-readable in Redis, no pickle attacks
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,

    # A single document can take minutes (OCR). Don't hoard multiple per worker.
    worker_prefetch_multiplier=1,

    # If the worker dies mid-task, redeliver instead of losing the job.
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Must exceed task_time_limit, or tasks get redelivered while still running.
    broker_transport_options={"visibility_timeout": settings.CELERY_TASK_TIME_LIMIT + 300},

    task_track_started=True,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    task_soft_time_limit=settings.CELERY_SOFT_TIME_LIMIT,

    result_expires=60 * 60 * 24,  # keep results 24h
)
