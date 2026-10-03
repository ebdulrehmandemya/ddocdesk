# backend/app/core/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "dDocDesk API"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str
    
    # MinIO / S3
    MINIO_ENDPOINT: str
    MINIO_ROOT_USER: str
    MINIO_ROOT_PASSWORD: str
    MINIO_USE_SSL: bool = False
    
    # Qdrant
    QDRANT_URL: str

    # Automatically load from root .env file
    model_config = SettingsConfigDict(
        # Go up 4 levels: core -> app -> backend -> ddocdesk (root)
        env_file=Path(__file__).resolve().parent.parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore" # Ignore any extra env vars that aren't defined in the class
    )

settings = Settings()
