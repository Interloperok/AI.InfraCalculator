#!/bin/bash

set -e

echo "Building new images..."
docker compose -f docker-compose.prod.yml build

echo "Stopping and removing old containers..."
docker compose -f docker-compose.prod.yml down

echo "Starting new containers with freshly built images..."
docker compose -f docker-compose.prod.yml up -d

echo "Deployment completed successfully!"
