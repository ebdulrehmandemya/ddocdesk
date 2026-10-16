# backend/app/core/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "dDocDesk API"
    API_V1_STR: str = "/api/v1"
    
    DATABASE_URL: str
    MINIO_ENDPOINT: str
    MINIO_ROOT_USER: str
    MINIO_ROOT_PASSWORD: str
    MINIO_USE_SSL: bool = False
    QDRANT_URL: str
    
    # Keycloak
    KEYCLOAK_ISSUER_URL: str = "http://localhost:8080/realms/ddocdesk"

        # SMTP / Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = False
    SMTP_FROM: str = "noreply@ddocdesk.io"

    # App
    APP_URL: str = "http://localhost:3000"
    INVITATION_EXPIRY_DAYS: int = 7

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"
    CELERY_TASK_TIME_LIMIT: int = 1800        # hard kill after 30 min
    CELERY_SOFT_TIME_LIMIT: int = 1740


    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
