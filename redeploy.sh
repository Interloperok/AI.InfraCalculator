#!/bin/bash

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"

echo "Validating compose configuration..."
docker compose -f "${COMPOSE_FILE}" config >/dev/null

echo "Building new images..."
docker compose -f "${COMPOSE_FILE}" build --pull

echo "Stopping and removing old containers..."
docker compose -f "${COMPOSE_FILE}" down

echo "Starting new containers with freshly built images..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "Deployment completed successfully!"
