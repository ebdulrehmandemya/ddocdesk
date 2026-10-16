from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "ddocdesk",
    broker=settings.REDIS_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_transport_options={"visibility_timeout": settings.CELERY_TASK_TIME_LIMIT + 300},
    task_track_started=True,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    task_soft_time_limit=settings.CELERY_SOFT_TIME_LIMIT,
    result_expires=60 * 60 * 24,
)

celery_app.conf.beat_schedule = {
    "reap-stuck-documents-every-5-minutes": {
        "task": "workers.reap_stuck_documents",
        "schedule": crontab(minute="*/5"),
    },
}
