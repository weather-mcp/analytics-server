# Environment Configuration Guide

Complete reference for configuring the Weather MCP Analytics Server environment variables.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Files](#configuration-files)
- [Environment Variables](#environment-variables)
- [Deployment Scenarios](#deployment-scenarios)
- [Security Considerations](#security-considerations)
- [Validation](#validation)

## Quick Start

```bash
# Copy example file
cp .env.example .env

# Edit with your values
nano .env

# Validate configuration
npm run validate-config
```

## Configuration Files

### Development

**File:** `.env`
**Purpose:** Local development and testing

```bash
NODE_ENV=development
PORT=3000
HOST=localhost
LOG_LEVEL=debug
```

### Production (Cloudflare Tunnel)

**File:** `.env` (on server)
**Purpose:** Production deployment with Cloudflare Tunnel

```bash
NODE_ENV=production
PORT=3000
HOST=127.0.0.1  # Localhost only - accessed via tunnel
LOG_LEVEL=info
```

### Production (Traditional)

**File:** `.env` (on server)
**Purpose:** Production deployment with direct nginx

```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0  # Listen on all interfaces
LOG_LEVEL=info
```

## Environment Variables

### Server Configuration

#### `NODE_ENV`
**Type:** String
**Default:** `development`
**Options:** `development`, `production`, `test`
**Required:** Yes

Controls application behavior and optimizations.

```bash
# Development - enables debugging, detailed logs
NODE_ENV=development

# Production - optimizations, minimal logs
NODE_ENV=production

# Test - special test configurations
NODE_ENV=test
```

#### `PORT`
**Type:** Number
**Default:** `3000`
**Range:** `1024-65535`
**Required:** Yes

Port for the API server to listen on.

```bash
# Default
PORT=3000

# Custom port
PORT=8080
```

#### `HOST`
**Type:** String
**Default:** `localhost`
**Required:** Yes

Host address to bind to.

```bash
# Localhost only (Cloudflare Tunnel, nginx reverse proxy)
HOST=127.0.0.1

# All interfaces (direct public access)
HOST=0.0.0.0

# Development
HOST=localhost
```

⚠️ **Security:** Use `127.0.0.1` for production with Cloudflare Tunnel or nginx. Never use `0.0.0.0` if you have a firewall configured to block the port.

#### `LOG_LEVEL`
**Type:** String
**Default:** `info`
**Options:** `fatal`, `error`, `warn`, `info`, `debug`, `trace`
**Required:** No

Logging verbosity level.

```bash
# Production - minimal logs
LOG_LEVEL=info

# Development - detailed logs
LOG_LEVEL=debug

# Troubleshooting - all logs
LOG_LEVEL=trace

# Errors only
LOG_LEVEL=error
```

### Database Configuration

#### `DATABASE_URL`
**Type:** Connection String
**Format:** `postgresql://user:password@host:port/database`
**Required:** Yes

PostgreSQL connection string.

```bash
# Local development
DATABASE_URL=postgresql://analytics:password@localhost:5432/analytics

# Production (same host)
DATABASE_URL=postgresql://analytics:StrongPassword123!@localhost:5432/analytics

# Remote database
DATABASE_URL=postgresql://analytics:password@db.example.com:5432/analytics

# With SSL
DATABASE_URL=postgresql://analytics:password@localhost:5432/analytics?sslmode=require
```

**SSL Modes:**
- `disable` - No SSL (development only)
- `require` - Require SSL (production)
- `verify-ca` - Verify certificate authority
- `verify-full` - Verify certificate and hostname

**Connection Pooling:**
```bash
# Add pool parameters
DATABASE_URL=postgresql://analytics:password@localhost:5432/analytics?max=20&idle_timeout=30
```

#### `DATABASE_POOL_SIZE`
**Type:** Number
**Default:** `20`
**Range:** `1-100`
**Required:** No

Maximum number of database connections in the pool.

```bash
# Default
DATABASE_POOL_SIZE=20

# Low traffic
DATABASE_POOL_SIZE=10

# High traffic
DATABASE_POOL_SIZE=50
```

**Recommendations:**
- Development: `5-10`
- Production (low traffic): `10-20`
- Production (high traffic): `20-50`

#### `DATABASE_TIMEOUT`
**Type:** Number (milliseconds)
**Default:** `30000` (30 seconds)
**Range:** `1000-120000`
**Required:** No

Database query timeout.

```bash
# Default (30 seconds)
DATABASE_TIMEOUT=30000

# Short timeout (10 seconds)
DATABASE_TIMEOUT=10000

# Long timeout (2 minutes)
DATABASE_TIMEOUT=120000
```

### Redis Configuration

#### `REDIS_URL`
**Type:** Connection String
**Format:** `redis://[user]:[password]@host:port[/db]`
**Required:** Yes

Redis connection string.

```bash
# Local development (no auth)
REDIS_URL=redis://localhost:6379

# Production (with auth)
REDIS_URL=redis://:StrongPassword123!@localhost:6379

# Remote Redis
REDIS_URL=redis://:password@redis.example.com:6379

# With database selection
REDIS_URL=redis://:password@localhost:6379/0

# Redis Sentinel
REDIS_URL=redis-sentinel://localhost:26379,localhost:26380/mymaster/0
```

#### `REDIS_KEY_PREFIX`
**Type:** String
**Default:** `weather-mcp:`
**Required:** No

Prefix for all Redis keys (useful for multi-tenant setups).

```bash
# Default
REDIS_KEY_PREFIX=weather-mcp:

# Custom prefix
REDIS_KEY_PREFIX=analytics:

# Multi-tenant
REDIS_KEY_PREFIX=tenant-123:
```

#### `REDIS_TTL`
**Type:** Number (seconds)
**Default:** `3600` (1 hour)
**Range:** `60-86400`
**Required:** No

Default TTL for cached items.

```bash
# Default (1 hour)
REDIS_TTL=3600

# Short cache (5 minutes)
REDIS_TTL=300

# Long cache (24 hours)
REDIS_TTL=86400
```

### Security Configuration

#### `RATE_LIMIT_MAX`
**Type:** Number
**Default:** `60`
**Range:** `1-1000`
**Required:** No

Maximum requests allowed per time window.

```bash
# Default (60 requests per minute)
RATE_LIMIT_MAX=60

# Strict limit (30 requests)
RATE_LIMIT_MAX=30

# Generous limit (120 requests)
RATE_LIMIT_MAX=120
```

#### `RATE_LIMIT_WINDOW`
**Type:** Number (milliseconds)
**Default:** `60000` (1 minute)
**Range:** `1000-3600000`
**Required:** No

Time window for rate limiting.

```bash
# Default (1 minute)
RATE_LIMIT_WINDOW=60000

# 30 seconds
RATE_LIMIT_WINDOW=30000

# 5 minutes
RATE_LIMIT_WINDOW=300000
```

**Common combinations:**
```bash
# Strict: 30 requests per 30 seconds
RATE_LIMIT_MAX=30
RATE_LIMIT_WINDOW=30000

# Moderate: 60 requests per minute (default)
RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW=60000

# Generous: 120 requests per 2 minutes
RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW=120000
```

#### `MAX_REQUEST_SIZE`
**Type:** String
**Default:** `100kb`
**Options:** Number with unit (`kb`, `mb`)
**Required:** No

Maximum size of request body.

```bash
# Default
MAX_REQUEST_SIZE=100kb

# Larger requests
MAX_REQUEST_SIZE=1mb

# Smaller requests
MAX_REQUEST_SIZE=50kb
```

#### `CORS_ORIGIN`
**Type:** String or Array
**Default:** `https://weather-mcp.dev`
**Required:** No

Allowed CORS origins for cross-domain requests.

```bash
# Single origin
CORS_ORIGIN=https://weather-mcp.dev

# Multiple origins (comma-separated)
CORS_ORIGIN=https://weather-mcp.dev,https://app.weather-mcp.dev

# Development (allow all - NOT for production!)
CORS_ORIGIN=*
```

#### `TRUST_PROXY`
**Type:** Boolean or Number
**Default:** `true`
**Options:** `true`, `false`, number
**Required:** No

Trust proxy headers (required for Cloudflare, nginx).

```bash
# Behind Cloudflare/nginx
TRUST_PROXY=true

# Direct connection
TRUST_PROXY=false

# Trust specific number of proxies
TRUST_PROXY=1
```

⚠️ **Security:** Always set to `true` when using Cloudflare Tunnel or nginx to correctly identify client IPs.

### Worker Configuration

#### `WORKER_CONCURRENCY`
**Type:** Number
**Default:** `5`
**Range:** `1-50`
**Required:** No

Number of concurrent jobs the worker can process.

```bash
# Default
WORKER_CONCURRENCY=5

# Low resource server
WORKER_CONCURRENCY=2

# High resource server
WORKER_CONCURRENCY=10
```

#### `WORKER_POLL_INTERVAL`
**Type:** Number (milliseconds)
**Default:** `5000` (5 seconds)
**Range:** `1000-60000`
**Required:** No

How often worker checks for new jobs.

```bash
# Default (5 seconds)
WORKER_POLL_INTERVAL=5000

# Aggressive (1 second)
WORKER_POLL_INTERVAL=1000

# Conservative (30 seconds)
WORKER_POLL_INTERVAL=30000
```

### Monitoring Configuration

#### `ENABLE_METRICS`
**Type:** Boolean
**Default:** `true`
**Required:** No

Enable Prometheus metrics endpoint.

```bash
# Enabled (recommended)
ENABLE_METRICS=true

# Disabled
ENABLE_METRICS=false
```

#### `METRICS_PORT`
**Type:** Number
**Default:** `9090`
**Range:** `1024-65535`
**Required:** No

Port for metrics endpoint (localhost only).

```bash
# Default
METRICS_PORT=9090

# Custom
METRICS_PORT=9100
```

#### `ENABLE_HEALTH_CHECK`
**Type:** Boolean
**Default:** `true`
**Required:** No

Enable `/health` endpoint.

```bash
# Enabled (required for production)
ENABLE_HEALTH_CHECK=true

# Disabled (not recommended)
ENABLE_HEALTH_CHECK=false
```

## Deployment Scenarios

### Scenario 1: Local Development

```bash
# .env
NODE_ENV=development
PORT=3000
HOST=localhost
LOG_LEVEL=debug

DATABASE_URL=postgresql://analytics:dev@localhost:5432/analytics
REDIS_URL=redis://localhost:6379

RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=60000

CORS_ORIGIN=http://localhost:3001

TRUST_PROXY=false
```

### Scenario 2: Production with Cloudflare Tunnel

```bash
# .env
NODE_ENV=production
PORT=3000
HOST=127.0.0.1  # IMPORTANT: localhost only
LOG_LEVEL=info

DATABASE_URL=postgresql://analytics:StrongPass123!@localhost:5432/analytics
REDIS_URL=redis://:RedisPass456!@localhost:6379

RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW=60000
MAX_REQUEST_SIZE=100kb

CORS_ORIGIN=https://weather-mcp.dev

TRUST_PROXY=true  # IMPORTANT: trust Cloudflare

ENABLE_METRICS=true
METRICS_PORT=9090
ENABLE_HEALTH_CHECK=true

WORKER_CONCURRENCY=5
WORKER_POLL_INTERVAL=5000
```

### Scenario 3: Production with Nginx Reverse Proxy

```bash
# .env
NODE_ENV=production
PORT=3000
HOST=127.0.0.1  # IMPORTANT: localhost only
LOG_LEVEL=info

DATABASE_URL=postgresql://analytics:StrongPass123!@localhost:5432/analytics
REDIS_URL=redis://:RedisPass456!@localhost:6379

RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW=60000
MAX_REQUEST_SIZE=100kb

CORS_ORIGIN=https://weather-mcp.dev

TRUST_PROXY=1  # Trust nginx (1 proxy layer)

ENABLE_METRICS=true
ENABLE_HEALTH_CHECK=true
```

### Scenario 4: High-Traffic Production

```bash
# .env
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
LOG_LEVEL=warn  # Less verbose for performance

DATABASE_URL=postgresql://analytics:StrongPass123!@localhost:5432/analytics?max=50
DATABASE_POOL_SIZE=50
DATABASE_TIMEOUT=10000

REDIS_URL=redis://:RedisPass456!@localhost:6379
REDIS_TTL=7200  # 2 hour cache

RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW=60000
MAX_REQUEST_SIZE=100kb

CORS_ORIGIN=https://weather-mcp.dev

TRUST_PROXY=true

WORKER_CONCURRENCY=10  # More concurrent jobs
WORKER_POLL_INTERVAL=2000  # Check more frequently
```

### Scenario 5: Testing Environment

```bash
# .env.test
NODE_ENV=test
PORT=3001  # Different port
HOST=localhost
LOG_LEVEL=silent  # No logs during tests

DATABASE_URL=postgresql://analytics:test@localhost:5432/analytics_test
REDIS_URL=redis://localhost:6380  # Different Redis instance

RATE_LIMIT_MAX=10000  # No rate limiting in tests
RATE_LIMIT_WINDOW=60000

TRUST_PROXY=false

ENABLE_METRICS=false
ENABLE_HEALTH_CHECK=true
```

## Security Considerations

### Database Credentials

✅ **DO:**
- Use strong passwords (20+ characters, mixed case, numbers, symbols)
- Use different passwords for dev and prod
- Store production passwords in a secrets manager
- Rotate passwords regularly (every 90 days)

❌ **DON'T:**
- Use default passwords (`postgres`, `admin`)
- Commit passwords to git
- Reuse passwords across environments
- Use simple passwords (`password123`)

### Redis Security

```bash
# Enable authentication
REDIS_URL=redis://:VeryStrongRedisPassword@localhost:6379

# Use Unix socket instead of TCP (more secure)
REDIS_URL=unix:///var/run/redis/redis.sock

# Enable TLS for remote connections
REDIS_URL=rediss://:password@redis.example.com:6380
```

### Rate Limiting

**Recommendations by deployment:**

| Deployment | Max Requests | Window | Note |
|------------|--------------|--------|------|
| Development | 1000 | 60s | Unlimited for testing |
| Staging | 120 | 60s | Moderate limits |
| Production (low) | 60 | 60s | Conservative |
| Production (high) | 120 | 60s | Generous |
| Public API | 30 | 60s | Strict |

### CORS Configuration

```bash
# Production - specific domains only
CORS_ORIGIN=https://weather-mcp.dev

# Multiple trusted domains
CORS_ORIGIN=https://weather-mcp.dev,https://app.weather-mcp.dev

# Development - localhost allowed
CORS_ORIGIN=http://localhost:3001,https://weather-mcp.dev

# NEVER in production
CORS_ORIGIN=*  # ❌ Allows any domain!
```

### Trust Proxy Settings

| Deployment | Setting | Reason |
|------------|---------|--------|
| Direct (no proxy) | `false` | No proxy in front |
| Nginx | `1` | One proxy layer |
| Cloudflare + Nginx | `2` | Two proxy layers |
| Cloudflare Tunnel | `true` | Trust all Cloudflare |

## Validation

### Manual Validation

```bash
# Check required variables are set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set"
fi

# Test database connection
npm run db:test

# Test Redis connection
npm run redis:test

# Validate all config
npm run validate-config
```

### Automated Validation Script

Create `scripts/validate-env.sh`:

```bash
#!/bin/bash

REQUIRED_VARS=(
  "NODE_ENV"
  "PORT"
  "HOST"
  "DATABASE_URL"
  "REDIS_URL"
)

ERRORS=0

for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    echo "❌ Missing required variable: $VAR"
    ERRORS=$((ERRORS + 1))
  else
    echo "✓ $VAR is set"
  fi
done

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ Configuration validation failed with $ERRORS error(s)"
  exit 1
else
  echo ""
  echo "✅ All required variables are set"
  exit 0
fi
```

Run validation:
```bash
chmod +x scripts/validate-env.sh
source .env && ./scripts/validate-env.sh
```

## Best Practices

1. **Never commit `.env` files** to version control
   ```bash
   # Add to .gitignore
   echo ".env" >> .gitignore
   echo ".env.local" >> .gitignore
   echo ".env.production" >> .gitignore
   ```

2. **Use environment-specific files**
   - `.env.example` - Template (committed)
   - `.env` - Development (not committed)
   - `.env.production` - Production (not committed)
   - `.env.test` - Testing (committed)

3. **Document all variables** in `.env.example`

4. **Use strong defaults** where possible

5. **Validate on startup** - fail fast if config is wrong

6. **Use secrets manager** for production (AWS Secrets Manager, HashiCorp Vault, etc.)

7. **Rotate credentials** regularly

8. **Audit access** to production environment variables

---

**Last Updated:** 2025-11-15
**Version:** 1.0.0
