.PHONY: setup infra-up infra-down dev check

# Install base dependencies (customize as you add package.json / requirements.txt)
setup:
	@echo "Setting up local environment..."
	cp -n .env.example .env || true
	docker compose up -d --wait

# Start infrastructure containers
infra-up:
	docker compose up -d

# Stop infrastructure containers
infra-down:
	docker compose down

# Start local development servers (placeholders for now)
dev:
	@echo "Run 'npm run dev' in ./frontend and 'source ./venv/bin/activate;uvicorn app.main:app --reload --port 8000' in ./backend"

# Run health checks against infrastructure
check:
	@echo "Checking PostgreSQL..."
	docker compose exec postgres pg_isready -U ddocdesk
	@echo "Checking MinIO..."
	curl -s -o /dev/null -w "MinIO API: %{http_code}\n" http://localhost:9000/minio/health/live
	@echo "Checking Qdrant..."
	curl -s -o /dev/null -w "Qdrant API: %{http_code}\n" http://localhost:6333/healthz
	@echo "Checking Keycloak..."
	curl -s -o /dev/null -w "Keycloak API: %{http_code}\n" http://localhost:8080/realms/master
