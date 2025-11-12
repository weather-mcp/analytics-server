#!/bin/bash

# Database Initialization Script
# This script initializes the analytics database with the schema

set -e  # Exit on error

# Configuration from environment or defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-54320}"
DB_NAME="${DB_NAME:-analytics}"
DB_USER="${DB_USER:-analytics}"
export PGPASSWORD="${DB_PASSWORD:-dev_password}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="${SCRIPT_DIR}/../src/database/schema.sql"

echo "=================================================="
echo "Analytics Database Initialization"
echo "=================================================="
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "=================================================="
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "Error: psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Check if schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "Error: Schema file not found at $SCHEMA_FILE"
    exit 1
fi

# Test connection
echo "Testing database connection..."
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "Error: Cannot connect to PostgreSQL server"
    echo "Please make sure PostgreSQL is running and credentials are correct"
    exit 1
fi
echo "✓ Connection successful"
echo ""

# Check if database exists, create if not
echo "Checking if database exists..."
DB_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")

if [ "$DB_EXISTS" != "1" ]; then
    echo "Creating database '$DB_NAME'..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
    echo "✓ Database created"
else
    echo "✓ Database already exists"
fi
echo ""

# Run schema
echo "Running schema initialization..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCHEMA_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================================="
    echo "✓ Database initialization completed successfully!"
    echo "=================================================="
    echo ""
    echo "Database Details:"
    echo "  - Tables created: events, daily_aggregations, hourly_aggregations, error_summary"
    echo "  - TimescaleDB hypertables configured"
    echo "  - Retention policies applied"
    echo "  - Compression policies enabled"
    echo ""
    echo "You can now start the API and worker services."
else
    echo ""
    echo "=================================================="
    echo "✗ Database initialization failed"
    echo "=================================================="
    exit 1
fi

# Verify tables were created
echo "Verifying tables..."
TABLES=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('events', 'daily_aggregations', 'hourly_aggregations', 'error_summary', 'system_metadata')
")

if [ "$TABLES" = "5" ]; then
    echo "✓ All tables created successfully"
else
    echo "⚠ Warning: Expected 5 tables, found $TABLES"
fi

# Check TimescaleDB extension
echo "Verifying TimescaleDB extension..."
TIMESCALE_INSTALLED=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
    SELECT COUNT(*) FROM pg_extension WHERE extname = 'timescaledb'
")

if [ "$TIMESCALE_INSTALLED" = "1" ]; then
    echo "✓ TimescaleDB extension enabled"

    # Get TimescaleDB version
    TIMESCALE_VERSION=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
        SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'
    ")
    echo "  TimescaleDB version: $TIMESCALE_VERSION"
else
    echo "✗ TimescaleDB extension not found"
    exit 1
fi

echo ""
echo "Database is ready for use!"
