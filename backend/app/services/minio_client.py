# backend/app/services/minio_client.py
import boto3
from botocore.config import Config
from app.core.config import settings

# Ensure endpoint has http:// scheme
endpoint = settings.MINIO_ENDPOINT
if not endpoint.startswith("http"):
    endpoint = f"{'https' if settings.MINIO_USE_SSL else 'http'}://{endpoint}"

s3_client = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=settings.MINIO_ROOT_USER,
    aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
    config=Config(signature_version="s3v4"),
    region_name="us-east-1",
)
