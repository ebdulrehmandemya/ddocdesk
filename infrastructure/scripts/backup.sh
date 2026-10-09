#!/bin/bash
set -e

BACKUP_DIR="./backups/$(date +%F_%T)"
mkdir -p $BACKUP_DIR

echo "📦 Backing up PostgreSQL..."
docker exec -t ddocdesk-postgres pg_dump -U ddocdesk ddocdesk > $BACKUP_DIR/db.sql

echo "📦 Backing up MinIO (Volumes)..."
# Using a temporary alpine container to tar the docker volume
docker run --rm -v ddocdesk_minio_data:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/minio.tar.gz /data

echo "📦 Backing up Qdrant (Snapshot API)..."
curl -s -X POST "http://localhost:6333/collections/document_chunks/snapshots" \
  -H 'Content-Type: application/json' \
  -d '{"snapshot_name": "mvp_backup"}' > /dev/null
  
# Download the snapshot
curl -s -o $BACKUP_DIR/qdrant.snapshot "http://localhost:6333/collections/document_chunks/snapshots/mvp_backup.snapshot"

echo "✅ Backup complete! Saved to $BACKUP_DIR"
