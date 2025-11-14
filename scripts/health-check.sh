#!/bin/bash

# Health Check Script
# Checks the health of all analytics services
# Usage: ./health-check.sh [--verbose]

# Configuration from environment or defaults
API_HOST="${API_HOST:-localhost}"
API_PORT="${API_PORT:-3000}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-analytics}"
DB_USER="${DB_USER:-analytics}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
export PGPASSWORD="${DB_PASSWORD:-changeme}"

VERBOSE=0
if [ "$1" = "--verbose" ]; then
    VERBOSE=1
fi

EXIT_CODE=0

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "Analytics Server Health Check"
echo "=================================================="
date
echo ""

# Function to print status
print_status() {
    local status=$1
    local message=$2
    local details=$3

    if [ $status -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $message"
        if [ $VERBOSE -eq 1 ] && [ -n "$details" ]; then
            echo "  $details"
        fi
    else
        echo -e "${RED}✗${NC} $message"
        if [ -n "$details" ]; then
            echo "  $details"
        fi
        EXIT_CODE=1
    fi
}

# Check API Server
echo "1. API Server ($API_HOST:$API_PORT)"
echo "-----------------------------------"

if command -v curl &> /dev/null; then
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://$API_HOST:$API_PORT/v1/health" 2>/dev/null)

    if [ "$RESPONSE" = "200" ]; then
        if [ $VERBOSE -eq 1 ]; then
            HEALTH_DATA=$(curl -s "http://$API_HOST:$API_PORT/v1/health" 2>/dev/null)
            print_status 0 "API Server is healthy" "$HEALTH_DATA"
        else
            print_status 0 "API Server is healthy"
        fi
    else
        print_status 1 "API Server returned HTTP $RESPONSE" "Expected 200"
    fi
else
    echo -e "${YELLOW}⚠${NC} curl not found, skipping API check"
fi

echo ""

# Check PostgreSQL
echo "2. PostgreSQL Database ($DB_HOST:$DB_PORT)"
echo "-------------------------------------------"

if command -v psql &> /dev/null; then
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        # Get database stats
        DB_SIZE=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
            SELECT pg_size_pretty(pg_database_size('$DB_NAME'))
        " 2>/dev/null)

        EVENT_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
            SELECT COUNT(*) FROM events
        " 2>/dev/null)

        TIMESCALE_VERSION=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
            SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'
        " 2>/dev/null)

        print_status 0 "PostgreSQL is healthy" "Size: $DB_SIZE, Events: $EVENT_COUNT, TimescaleDB: $TIMESCALE_VERSION"
    else
        print_status 1 "Cannot connect to PostgreSQL" "Check credentials and connection"
    fi
else
    echo -e "${YELLOW}⚠${NC} psql not found, skipping database check"
fi

echo ""

# Check Redis
echo "3. Redis Queue ($REDIS_HOST:$REDIS_PORT)"
echo "-----------------------------------------"

if command -v redis-cli &> /dev/null; then
    REDIS_PING=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING 2>/dev/null)

    if [ "$REDIS_PING" = "PONG" ]; then
        # Get queue stats
        QUEUE_DEPTH=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LLEN analytics:events 2>/dev/null)
        MEMORY_USAGE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r\n ')

        print_status 0 "Redis is healthy" "Queue depth: $QUEUE_DEPTH, Memory: $MEMORY_USAGE"
    else
        print_status 1 "Cannot connect to Redis" "Check Redis server and connection"
    fi
else
    echo -e "${YELLOW}⚠${NC} redis-cli not found, skipping Redis check"
fi

echo ""

# Check Docker Containers (if running in Docker)
if command -v docker &> /dev/null; then
    echo "4. Docker Containers"
    echo "--------------------"

    # Check if containers exist
    CONTAINERS=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "(analytics-api|analytics-worker|analytics-postgres|analytics-redis)" || true)

    if [ -n "$CONTAINERS" ]; then
        while IFS= read -r container; do
            STATUS=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
            HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)

            if [ "$STATUS" = "running" ]; then
                if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "<no value>" ]; then
                    print_status 0 "$container is running" "Status: $STATUS"
                else
                    print_status 1 "$container is unhealthy" "Health: $HEALTH"
                fi
            else
                print_status 1 "$container is not running" "Status: $STATUS"
            fi
        done <<< "$CONTAINERS"
    else
        echo -e "${YELLOW}⚠${NC} No analytics containers found"
    fi

    echo ""
fi

# Check Disk Space
echo "5. Disk Space"
echo "-------------"

DISK_USAGE=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_AVAILABLE=$(df -h . | tail -1 | awk '{print $4}')

if [ $DISK_USAGE -lt 80 ]; then
    print_status 0 "Disk space OK" "Used: ${DISK_USAGE}%, Available: ${DISK_AVAILABLE}"
elif [ $DISK_USAGE -lt 90 ]; then
    echo -e "${YELLOW}⚠${NC} Disk space warning: ${DISK_USAGE}% used, ${DISK_AVAILABLE} available"
else
    print_status 1 "Disk space critical" "Used: ${DISK_USAGE}%, Available: ${DISK_AVAILABLE}"
fi

echo ""

# Summary
echo "=================================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed${NC}"
else
    echo -e "${RED}✗ Some checks failed${NC}"
fi
echo "=================================================="
echo ""

exit $EXIT_CODE
