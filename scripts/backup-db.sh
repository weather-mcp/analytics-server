#!/bin/bash

# Database Backup Script
# Creates compressed backups of the analytics database
# Usage: ./backup-db.sh [backup-directory]

set -e  # Exit on error

# Configuration from environment or defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-analytics}"
DB_USER="${DB_USER:-analytics}"
export PGPASSWORD="${DB_PASSWORD:-changeme}"

# Backup configuration
BACKUP_DIR="${1:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="analytics_backup_${TIMESTAMP}.sql.gz"

echo "=================================================="
echo "Analytics Database Backup"
echo "=================================================="
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "Backup Directory: $BACKUP_DIR"
echo "Retention: $RETENTION_DAYS days"
echo "=================================================="
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if pg_dump is available
if ! command -v pg_dump &> /dev/null; then
    echo "Error: pg_dump command not found. Please install PostgreSQL client."
    exit 1
fi

# Test connection
echo "Testing database connection..."
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo "Error: Cannot connect to PostgreSQL server"
    exit 1
fi
echo "✓ Connection successful"
echo ""

# Create backup
echo "Creating backup..."
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"

# Backup with compression
pg_dump -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=plain \
        --no-owner \
        --no-acl \
        --verbose \
        2>&1 | gzip > "$BACKUP_PATH"

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
    echo ""
    echo "✓ Backup created successfully"
    echo "  File: $BACKUP_PATH"
    echo "  Size: $BACKUP_SIZE"
else
    echo ""
    echo "✗ Backup failed"
    rm -f "$BACKUP_PATH"
    exit 1
fi

# Verify backup
echo ""
echo "Verifying backup..."
if gunzip -t "$BACKUP_PATH" 2>/dev/null; then
    echo "✓ Backup file is valid"
else
    echo "✗ Backup file is corrupted"
    exit 1
fi

# Clean up old backups
echo ""
echo "Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "analytics_backup_*.sql.gz" -type f -mtime "+$RETENTION_DAYS" -delete
OLD_BACKUPS=$(find "$BACKUP_DIR" -name "analytics_backup_*.sql.gz" -type f | wc -l)
echo "✓ Retained $OLD_BACKUPS backup(s)"

# Calculate total backup size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "  Total backup size: $TOTAL_SIZE"

echo ""
echo "=================================================="
echo "✓ Backup completed successfully!"
echo "=================================================="
echo ""
echo "To restore this backup, run:"
echo "  gunzip -c $BACKUP_PATH | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
echo ""
