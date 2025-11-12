#!/bin/bash

# Development Startup Script
# Starts all services needed for local development

set -e

echo "🚀 Starting Analytics Server - Development Mode"
echo "=============================================="

# Load environment variables
if [ -f .env ]; then
  echo "📝 Loading environment variables..."
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker first."
  exit 1
fi

echo ""
echo "🐳 Starting infrastructure services (PostgreSQL, Redis)..."
docker-compose up -d postgres redis

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U ${DB_USER:-analytics} > /dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL is ready"

# Wait for Redis
echo "Waiting for Redis..."
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "✅ Redis is ready"

# Initialize database if needed
echo ""
echo "🔧 Checking database initialization..."
if ! npm run build > /dev/null 2>&1 || ! node -e "require('./dist/database/migrations.js').checkMigrations()" 2>/dev/null; then
  echo "Running database initialization..."
  ./scripts/init-db.sh
fi

echo ""
echo "✨ Infrastructure is ready!"
echo ""
echo "You can now run:"
echo "  npm run dev        # Start API server"
echo "  npm run dev:worker # Start worker process"
echo "  cd dashboard && npm run dev  # Start dashboard"
echo ""
echo "Or run everything with Docker:"
echo "  docker-compose up"
