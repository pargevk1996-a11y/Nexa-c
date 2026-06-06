.PHONY: up down logs ps build health certs dev-up dev-down dev-health ci-local test test-e2e test-load test-load-gate backup-db restore-db staging-up

COMPOSE ?= docker compose
COMPOSE_FILES := -f docker-compose.yml
COMPOSE_OPTIONAL := -f docker-compose.yml -f docker-compose.optional.yml
COMPOSE_STAGING := -f docker-compose.yml -f docker-compose.staging.yml

up:
	$(COMPOSE) $(COMPOSE_FILES) --profile dev up -d --build

down:
	$(COMPOSE) $(COMPOSE_FILES) down

logs:
	$(COMPOSE) $(COMPOSE_FILES) logs -f

ps:
	$(COMPOSE) $(COMPOSE_FILES) ps

build:
	$(COMPOSE) $(COMPOSE_FILES) build

health:
	@curl -sk https://localhost/health 2>/dev/null || curl -s http://localhost:8000/health

certs:
	bash infrastructure/tls/dev/generate-dev-certs.sh

# Local dev without Docker (uvicorn on 8000-8008)
dev-infra-up:
	bash scripts/dev-infra-up.sh

dev-up: dev-infra-up
	bash scripts/dev-up.sh

dev-down:
	bash scripts/dev-down.sh

dev-health:
	@.venv/bin/python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())" 2>/dev/null || true
	@.venv/bin/python -c "import urllib.request; print('UI', urllib.request.urlopen('http://127.0.0.1:5173').status)" 2>/dev/null || echo "UI not ready"

prod-up:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml up -d --build

staging-up:
	$(COMPOSE) $(COMPOSE_STAGING) up -d --build

ci-local:
	bash scripts/ci-local.sh

test:
	bash scripts/run-tests.sh

test-e2e:
	cd tests/e2e && npm ci 2>/dev/null || npm install && npx playwright install chromium && npm test

test-load:
	locust -f tests/load/locustfile.py --headless -u 10 -r 2 -t 15s -H $${GATEWAY_HOST:-http://127.0.0.1:8000}

## CI gate: fails if any endpoint's p99 exceeds LOAD_P99_THRESHOLD_MS (default 150ms).
test-load-gate:
	LOAD_P99_THRESHOLD_MS=$${LOAD_P99_THRESHOLD_MS:-150} \
	locust -f tests/load/locustfile.py --headless \
	  -u $${LOAD_USERS:-20} -r $${LOAD_SPAWN_RATE:-5} -t $${LOAD_DURATION:-60s} \
	  -H $${GATEWAY_HOST:-http://127.0.0.1:8000} \
	  --only-summary

backup-db:
	bash scripts/backup-postgres.sh

restore-db:
	@echo "Usage: bash scripts/restore-postgres.sh <db_name> <dump.sql.gz>"
	@exit 1

optional-up:
	$(COMPOSE) $(COMPOSE_OPTIONAL) --profile messaging --profile objectstore --profile observability up -d

optional-logging-up:
	$(COMPOSE) $(COMPOSE_OPTIONAL) --profile logging up -d

db-migrate:
	bash scripts/apply-db-migrations.sh
