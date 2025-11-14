#!/bin/bash

# Database Restore Script
# Restores a backup to the analytics database
# Usage: ./restore-db.sh <backup-file>

set -e  # Exit on error

# Check if backup file argument is provided
if [ $# -eq 0 ]; then
    echo "Error: No backup file specified"
    echo "Usage: $0 <backup-file>"
    echo ""
    echo "Example:"
    echo "  $0 ./backups/analytics_backup_20250113_120000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Configuration from environment or defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-analytics}"
DB_USER="${DB_USER:-analytics}"
export PGPASSWORD="${DB_PASSWORD:-changeme}"

echo "=================================================="
echo "Analytics Database Restore"
echo "=================================================="
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "Backup File: $BACKUP_FILE"
echo "=================================================="
echo ""

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "Error: psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Test connection
echo "Testing database connection..."
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "Error: Cannot connect to PostgreSQL server"
    exit 1
fi
echo "✓ Connection successful"
echo ""

# Verify backup file
echo "Verifying backup file..."
if [[ "$BACKUP_FILE" == *.gz ]]; then
    if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
        echo "✓ Backup file is valid (gzipped)"
    else
        echo "✗ Backup file is corrupted"
        exit 1
    fi
elif [[ "$BACKUP_FILE" == *.sql ]]; then
    echo "✓ Backup file is valid (SQL)"
else
    echo "✗ Unknown backup file format (expected .sql or .sql.gz)"
    exit 1
fi
echo ""

# Warning about data loss
echo "⚠️  WARNING ⚠️"
echo "This will drop and recreate the '$DB_NAME' database."
echo "All existing data will be lost!"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""

# Terminate all connections to the database
echo "Terminating all connections to database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "
    SELECT pg_terminate_backend(pg_stat_activity.pid)
    FROM pg_stat_activity
    WHERE pg_stat_activity.datname = '$DB_NAME'
      AND pid <> pg_backend_pid();"
echo "✓ Connections terminated"
echo ""

# Drop database if exists
echo "Dropping existing database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME"
echo "✓ Database dropped"
echo ""

# Create fresh database
echo "Creating fresh database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
echo "✓ Database created"
echo ""

# Enable TimescaleDB extension
echo "Enabling TimescaleDB extension..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE"
echo "✓ TimescaleDB enabled"
echo ""

# Restore backup
echo "Restoring backup..."
if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
else
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
    echo "✓ Restore completed successfully"
else
    echo "✗ Restore failed"
    exit 1
fi
echo ""

# Verify restoration
echo "Verifying restoration..."
TABLES=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('events', 'daily_aggregations', 'hourly_aggregations', 'error_summary', 'system_metadata')
")

if [ "$TABLES" = "5" ]; then
    echo "✓ All expected tables present"
else
    echo "⚠ Warning: Expected 5 tables, found $TABLES"
fi

# Check data
EVENT_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM events")
echo "  Events: $EVENT_COUNT rows"

DAILY_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM daily_aggregations")
echo "  Daily aggregations: $DAILY_COUNT rows"

echo ""
echo "=================================================="
echo "✓ Database restored successfully!"
echo "=================================================="
echo ""
echo "You can now start the API and worker services."
echo ""
