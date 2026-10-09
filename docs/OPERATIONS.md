# Operations & Recovery

## Backups
Run `./infrastructure/scripts/backup.sh` daily. It dumps Postgres, tars the MinIO volume, and triggers a Qdrant snapshot.

## Disaster Recovery
1. Start fresh containers: `docker compose up -d`
2. Restore Postgres: `cat backups/latest/db.sql | docker exec -i ddocdesk-postgres psql -U ddocdesk -d ddocdesk`
3. Restore MinIO: Extract the tarball back into the volume.
4. Restore Qdrant: POST the `.snapshot` file to the Qdrant recovery API.
