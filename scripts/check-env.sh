#!/bin/bash

# Environment Configuration Checker
# Validates .env file for production deployment
# Checks for required variables and insecure default values

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ENV_FILE="${1:-.env}"
ERRORS=0
WARNINGS=0

# Function to print colored messages
error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((ERRORS++))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    error ".env file not found at: $ENV_FILE"
    exit 1
fi

echo "Checking environment configuration: $ENV_FILE"
echo ""

# Load .env file
set -a
source "$ENV_FILE"
set +a

# Required variables
REQUIRED_VARS=(
    "NODE_ENV"
    "PORT"
    "REDIS_HOST"
    "REDIS_PORT"
    "DB_HOST"
    "DB_PORT"
    "DB_NAME"
    "DB_USER"
    "DB_PASSWORD"
    "CORS_ORIGIN"
)

echo "=== Required Variables ==="
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        error "$var is not set"
    else
        success "$var is set"
    fi
done
echo ""

# Check for insecure default values
echo "=== Security Checks ==="

# Check NODE_ENV
if [ "$NODE_ENV" != "production" ]; then
    warn "NODE_ENV is not set to 'production' (current: $NODE_ENV)"
fi

# Check for default passwords
INSECURE_PASSWORDS=(
    "changeme"
    "password"
    "admin"
    "test"
    "CHANGE_ME"
)

for password in "${INSECURE_PASSWORDS[@]}"; do
    if [[ "${DB_PASSWORD:-}" == *"$password"* ]]; then
        error "DB_PASSWORD contains insecure value: $password"
    fi
    if [[ "${REDIS_PASSWORD:-}" == *"$password"* ]]; then
        error "REDIS_PASSWORD contains insecure value: $password"
    fi
    if [[ "${GRAFANA_ADMIN_PASSWORD:-}" == *"$password"* ]]; then
        error "GRAFANA_ADMIN_PASSWORD contains insecure value: $password"
    fi
done

# Check password strength
check_password_strength() {
    local var_name=$1
    local password="${!var_name:-}"

    if [ -n "$password" ]; then
        local length=${#password}
        if [ $length -lt 16 ]; then
            warn "$var_name is shorter than 16 characters (length: $length)"
        else
            success "$var_name has adequate length"
        fi
    fi
}

check_password_strength "DB_PASSWORD"
check_password_strength "REDIS_PASSWORD"
check_password_strength "GRAFANA_ADMIN_PASSWORD"

# Check CORS configuration
if [[ "$CORS_ORIGIN" == *"localhost"* ]] && [ "$NODE_ENV" == "production" ]; then
    warn "CORS_ORIGIN contains 'localhost' in production mode"
fi

if [ "$CORS_ORIGIN" == "*" ]; then
    error "CORS_ORIGIN is set to '*' (allows all origins)"
fi

echo ""

# Configuration recommendations
echo "=== Configuration Recommendations ==="

# Check rate limiting
if [ "${RATE_LIMIT_PER_MINUTE:-60}" -gt 100 ]; then
    warn "RATE_LIMIT_PER_MINUTE is set high (${RATE_LIMIT_PER_MINUTE:-60}), consider lowering"
fi

# Check database pool size
if [ "${DB_MAX_CONNECTIONS:-10}" -lt 20 ]; then
    warn "DB_MAX_CONNECTIONS is less than 20 (current: ${DB_MAX_CONNECTIONS:-10}), may need to increase for production"
fi

# Check if metrics are enabled
if [ "${ENABLE_METRICS:-true}" != "true" ]; then
    warn "ENABLE_METRICS is disabled, monitoring will not work"
fi

# Check cache configuration
if [ "${CACHE_ENABLED:-true}" != "true" ]; then
    warn "CACHE_ENABLED is disabled, performance may be degraded"
fi

echo ""

# Summary
echo "=== Summary ==="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    error "Configuration validation failed with $ERRORS error(s)"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    warn "Configuration has $WARNINGS warning(s), review recommended"
    exit 0
else
    success "Configuration validation passed!"
    exit 0
fi
