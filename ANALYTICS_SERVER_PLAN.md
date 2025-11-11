# Analytics Collection Server - Implementation Plan

**Version:** 1.0
**Date:** 2025-11-10
**Status:** Planning Phase
**Project Name:** weather-mcp-analytics

## Executive Summary

This document outlines the design and implementation of a lightweight, privacy-respecting analytics collection server for Weather MCP Server. The server is designed to be:

- **Cost-effective**: Run on minimal infrastructure (< $10/month)
- **Scalable**: Handle thousands of MCP server instances
- **Secure**: Rate limiting, DDoS protection, no user tracking
- **Privacy-first**: No IP logging, anonymous data only
- **Transparent**: Public dashboard showing aggregate metrics
- **Open source**: All code auditable

**Tech Stack**: Node.js/TypeScript, PostgreSQL (TimescaleDB), Redis, Nginx, Docker

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Internet/CDN                           │
│              (Cloudflare for DDoS protection)              │
└───────────────────────┬────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌────────────────────────────────────────────────────────────┐
│                   Nginx Reverse Proxy                      │
│  - TLS termination                                         │
│  - Rate limiting (per IP)                                  │
│  - Request validation                                      │
│  - No IP logging                                           │
└───────────────────────┬────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │                             │
         ▼                             ▼
┌─────────────────┐          ┌─────────────────┐
│  API Service    │          │ Dashboard API   │
│  (Node.js)      │          │   (Read-only)   │
│                 │          │                 │
│ - Validation    │          │ - Aggregations  │
│ - Batching      │          │ - Public stats  │
│ - Anonymization │          │ - Charts data   │
└────────┬────────┘          └────────┬────────┘
         │                            │
         ▼                            │
┌─────────────────┐                   │
│  Redis Queue    │                   │
│  - Buffer       │                   │
│  - Deduplication│                   │
└────────┬────────┘                   │
         │                            │
         ▼                            │
┌─────────────────┐                   │
│ Worker Process  │                   │
│ - Batch insert  │                   │
│ - Aggregation   │                   │
└────────┬────────┘                   │
         │                            │
         └──────────────┬─────────────┘
                        ▼
              ┌───────────────────┐
              │  PostgreSQL +     │
              │  TimescaleDB      │
              │                   │
              │ - Events (raw)    │
              │ - Aggregations    │
              │ - Retention       │
              └───────────────────┘
```

### 1.2 Component Responsibilities

#### API Service (Node.js/TypeScript)
- Receive analytics batches from MCP servers
- Validate event structure
- Enforce privacy rules (reject PII)
- Queue events to Redis
- Return 200 OK immediately

#### Redis Queue
- Buffer incoming events
- Prevent duplicate processing
- Enable async batch processing
- Handle burst traffic

#### Worker Process
- Consume events from Redis
- Batch insert to PostgreSQL
- Update real-time aggregations
- Run periodic cleanup jobs

#### PostgreSQL + TimescaleDB
- Store raw events (90-day retention)
- Store aggregated metrics (2-year retention)
- Efficient time-series queries
- Automatic data expiration

#### Dashboard API
- Public read-only endpoint
- Pre-computed aggregations
- Cached responses
- No PII exposure

---

## 2. Technology Stack

### 2.1 Core Technologies

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Runtime** | Node.js 20 LTS | Same as MCP server, TypeScript support |
| **Framework** | Fastify | Fastest Node.js framework, low overhead |
| **Database** | PostgreSQL 16 | ACID compliance, TimescaleDB extension |
| **Time-Series** | TimescaleDB | Optimized for time-series data, auto-retention |
| **Queue** | Redis 7 | Fast, reliable, simple pub/sub |
| **Reverse Proxy** | Nginx | Battle-tested, rate limiting, TLS |
| **Container** | Docker | Easy deployment, isolation |
| **Orchestration** | Docker Compose | Simple, no Kubernetes needed yet |
| **CDN** | Cloudflare Free | DDoS protection, global caching |

### 2.2 Development Tools

- **Language**: TypeScript 5.x
- **Package Manager**: npm
- **Testing**: Vitest
- **Linting**: ESLint + Prettier
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: Pino (structured JSON logging)

---

## 3. Database Design

### 3.1 Schema Design

#### Events Table (Raw Events)

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  timestamp_hour TIMESTAMPTZ NOT NULL,  -- Pre-rounded for grouping
  version VARCHAR(20) NOT NULL,
  tool VARCHAR(50) NOT NULL,
  status VARCHAR(10) NOT NULL,  -- 'success' or 'error'
  analytics_level VARCHAR(10) NOT NULL,  -- 'minimal', 'standard', 'detailed'

  -- Standard level fields
  response_time_ms INTEGER,
  service VARCHAR(20),  -- 'noaa', 'openmeteo', etc.
  cache_hit BOOLEAN,
  retry_count INTEGER,
  country VARCHAR(2),  -- ISO 3166-1 alpha-2

  -- Detailed level fields
  parameters JSONB,
  session_id VARCHAR(16),  -- Hashed
  sequence_number INTEGER,

  -- Error tracking
  error_type VARCHAR(100),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable (TimescaleDB)
SELECT create_hypertable('events', 'timestamp');

-- Indexes
CREATE INDEX idx_events_timestamp_hour ON events (timestamp_hour);
CREATE INDEX idx_events_tool ON events (tool);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_version ON events (version);
CREATE INDEX idx_events_country ON events (country);

-- Retention policy (auto-delete after 90 days)
SELECT add_retention_policy('events', INTERVAL '90 days');
```

#### Aggregations Table (Pre-computed Metrics)

```sql
CREATE TABLE daily_aggregations (
  date DATE NOT NULL,
  tool VARCHAR(50) NOT NULL,
  version VARCHAR(20),
  country VARCHAR(2),

  -- Counts
  total_calls INTEGER NOT NULL,
  success_calls INTEGER NOT NULL,
  error_calls INTEGER NOT NULL,

  -- Performance
  avg_response_time_ms REAL,
  p50_response_time_ms REAL,
  p95_response_time_ms REAL,
  p99_response_time_ms REAL,

  -- Cache metrics
  cache_hit_rate REAL,

  -- Service distribution
  noaa_calls INTEGER,
  openmeteo_calls INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (date, tool, version, country)
);

CREATE INDEX idx_daily_agg_date ON daily_aggregations (date DESC);
CREATE INDEX idx_daily_agg_tool ON daily_aggregations (tool);
```

#### Error Summary Table

```sql
CREATE TABLE error_summary (
  hour TIMESTAMPTZ NOT NULL,
  tool VARCHAR(50) NOT NULL,
  error_type VARCHAR(100) NOT NULL,
  count INTEGER NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (hour, tool, error_type)
);

SELECT create_hypertable('error_summary', 'hour');
SELECT add_retention_policy('error_summary', INTERVAL '90 days');
```

### 3.2 Data Retention Policy

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Raw events | 90 days | Detailed troubleshooting window |
| Daily aggregations | 2 years | Long-term trend analysis |
| Hourly aggregations | 30 days | Short-term performance monitoring |
| Error summaries | 90 days | Bug fix verification period |

---

## 4. API Design

### 4.1 Ingestion Endpoint

**POST /v1/events**

Accepts batches of analytics events from MCP servers.

**Request:**
```json
{
  "events": [
    {
      "version": "1.6.1",
      "tool": "get_forecast",
      "status": "success",
      "timestamp_hour": "2025-11-10T14:00:00Z",
      "analytics_level": "minimal"
    },
    {
      "version": "1.6.1",
      "tool": "get_alerts",
      "status": "error",
      "timestamp_hour": "2025-11-10T14:00:00Z",
      "analytics_level": "standard",
      "response_time_ms": 5420,
      "error_type": "ServiceUnavailableError",
      "service": "noaa",
      "country": "US"
    }
  ]
}
```

**Response:**
```json
{
  "status": "accepted",
  "count": 2,
  "timestamp": "2025-11-10T14:23:45Z"
}
```

**Validation Rules:**
- Max batch size: 100 events
- Max request size: 100KB
- Required fields: version, tool, status, timestamp_hour, analytics_level
- Reject events with PII (coordinates, location names, user IDs)
- Validate enums (status, analytics_level, tool names)

**Rate Limiting:**
- 60 requests per minute per IP
- 1000 events per minute per IP
- Burst allowance: 10 requests

**Error Responses:**
```json
// 400 Bad Request
{
  "error": "validation_failed",
  "details": "Invalid analytics_level: 'invalid'"
}

// 429 Too Many Requests
{
  "error": "rate_limit_exceeded",
  "retry_after": 60
}

// 503 Service Unavailable
{
  "error": "service_unavailable",
  "message": "Analytics temporarily unavailable"
}
```

### 4.2 Dashboard API

**GET /v1/stats/overview**

Public aggregated statistics.

**Response:**
```json
{
  "period": "last_7_days",
  "start_date": "2025-11-03",
  "end_date": "2025-11-10",
  "summary": {
    "total_calls": 125430,
    "unique_versions": 5,
    "active_installs": 89,  // Estimated from distinct session patterns
    "success_rate": 0.987,
    "avg_response_time_ms": 234
  },
  "tools": [
    {
      "name": "get_forecast",
      "calls": 45120,
      "success_rate": 0.992,
      "avg_response_time_ms": 198
    },
    {
      "name": "get_current_conditions",
      "calls": 32450,
      "success_rate": 0.985,
      "avg_response_time_ms": 156
    }
  ],
  "errors": [
    {
      "type": "ServiceUnavailableError",
      "count": 342,
      "percentage": 0.27
    }
  ],
  "cache_hit_rate": 0.68
}
```

**GET /v1/stats/tool/:toolName**

Detailed stats for specific tool.

**GET /v1/stats/health**

Public health check.

**Response:**
```json
{
  "status": "healthy",
  "uptime_seconds": 12345678,
  "events_processed_24h": 18934,
  "last_event_received": "2025-11-10T14:23:45Z"
}
```

---

## 5. Implementation Details

### 5.1 API Service (`src/api/index.ts`)

```typescript
import Fastify from 'fastify';
import { validateEventBatch } from './validation.js';
import { queueEvents } from './queue.js';
import { logger } from './logger.js';

const server = Fastify({
  logger: false,  // Use custom logger
  trustProxy: true,  // Behind Nginx
  bodyLimit: 100 * 1024  // 100KB max
});

// Health check
server.get('/v1/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Event ingestion
server.post('/v1/events', async (request, reply) => {
  try {
    const { events } = request.body as { events: unknown[] };

    // Validate batch
    const validationResult = validateEventBatch(events);
    if (!validationResult.valid) {
      reply.code(400);
      return {
        error: 'validation_failed',
        details: validationResult.errors
      };
    }

    // Queue for processing (async)
    await queueEvents(validationResult.events);

    logger.info('Events queued', {
      count: events.length,
      // DO NOT LOG IP ADDRESS
    });

    return {
      status: 'accepted',
      count: events.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Event ingestion failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    reply.code(503);
    return {
      error: 'service_unavailable',
      message: 'Analytics temporarily unavailable'
    };
  }
});

// Dashboard stats
server.get('/v1/stats/overview', async (request, reply) => {
  // Return pre-computed stats from cache/database
  // Implementation in separate file
});

const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    logger.error('Server failed to start', { error: err.message });
    process.exit(1);
  }
  logger.info('Analytics API started', { port: PORT });
});
```

### 5.2 Validation (`src/api/validation.ts`)

```typescript
import { z } from 'zod';

const EventSchema = z.object({
  version: z.string().max(20),
  tool: z.string().max(50),
  status: z.enum(['success', 'error']),
  timestamp_hour: z.string().datetime(),
  analytics_level: z.enum(['minimal', 'standard', 'detailed']),

  // Optional standard fields
  response_time_ms: z.number().int().min(0).max(120000).optional(),
  service: z.string().max(20).optional(),
  cache_hit: z.boolean().optional(),
  retry_count: z.number().int().min(0).max(10).optional(),
  country: z.string().length(2).optional(),

  // Optional detailed fields
  parameters: z.record(z.unknown()).optional(),
  session_id: z.string().length(16).optional(),
  sequence_number: z.number().int().min(0).optional(),

  // Error tracking
  error_type: z.string().max(100).optional()
});

export function validateEventBatch(events: unknown[]): {
  valid: boolean;
  events?: z.infer<typeof EventSchema>[];
  errors?: string[];
} {
  if (!Array.isArray(events)) {
    return { valid: false, errors: ['Events must be an array'] };
  }

  if (events.length === 0) {
    return { valid: false, errors: ['Batch cannot be empty'] };
  }

  if (events.length > 100) {
    return { valid: false, errors: ['Batch size exceeds 100 events'] };
  }

  const validatedEvents: z.infer<typeof EventSchema>[] = [];
  const errors: string[] = [];

  for (let i = 0; i < events.length; i++) {
    try {
      // Reject events with PII
      if (hasPII(events[i])) {
        errors.push(`Event ${i}: Contains PII (rejected for privacy)`);
        continue;
      }

      const validated = EventSchema.parse(events[i]);
      validatedEvents.push(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(`Event ${i}: ${error.errors[0].message}`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, events: validatedEvents };
}

function hasPII(event: any): boolean {
  const piiFields = ['latitude', 'longitude', 'lat', 'lon', 'location', 'user_id', 'ip', 'email'];

  for (const field of piiFields) {
    if (field in event) {
      return true;
    }
  }

  // Check nested parameters
  if (event.parameters && typeof event.parameters === 'object') {
    for (const field of piiFields) {
      if (field in event.parameters) {
        return true;
      }
    }
  }

  return false;
}
```

### 5.3 Queue Service (`src/queue/index.ts`)

```typescript
import { Redis } from 'ioredis';
import { logger } from '../logger.js';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: 3
});

const QUEUE_KEY = 'analytics:events';
const MAX_QUEUE_SIZE = 10000;  // Safety limit

export async function queueEvents(events: any[]): Promise<void> {
  const queueSize = await redis.llen(QUEUE_KEY);

  if (queueSize > MAX_QUEUE_SIZE) {
    logger.warn('Queue size exceeded', {
      currentSize: queueSize,
      maxSize: MAX_QUEUE_SIZE
    });
    throw new Error('Queue full, try again later');
  }

  const serialized = events.map(e => JSON.stringify(e));
  await redis.rpush(QUEUE_KEY, ...serialized);

  logger.debug('Events queued', { count: events.length });
}

export async function dequeueEvents(batchSize: number = 50): Promise<any[]> {
  const serialized = await redis.lpop(QUEUE_KEY, batchSize);

  if (!serialized || serialized.length === 0) {
    return [];
  }

  return serialized.map(s => JSON.parse(s));
}
```

### 5.4 Worker Process (`src/worker/index.ts`)

```typescript
import { dequeueEvents } from '../queue/index.js';
import { insertEvents, updateAggregations } from '../database/index.js';
import { logger } from '../logger.js';

const POLL_INTERVAL_MS = 1000;  // 1 second
const BATCH_SIZE = 50;

async function processEvents() {
  while (true) {
    try {
      const events = await dequeueEvents(BATCH_SIZE);

      if (events.length > 0) {
        // Insert into database
        await insertEvents(events);

        // Update real-time aggregations
        await updateAggregations(events);

        logger.info('Batch processed', { count: events.length });
      }

      // Sleep before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    } catch (error) {
      logger.error('Worker error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Back off on error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Start worker
logger.info('Worker starting');
processEvents();
```

### 5.5 Database Service (`src/database/index.ts`)

```typescript
import { Pool } from 'pg';
import { logger } from '../logger.js';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'analytics',
  user: process.env.DB_USER || 'analytics',
  password: process.env.DB_PASSWORD,
  max: 10,  // Connection pool size
  idleTimeoutMillis: 30000
});

export async function insertEvents(events: any[]): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const event of events) {
      await client.query(
        `INSERT INTO events (
          timestamp, timestamp_hour, version, tool, status,
          analytics_level, response_time_ms, service, cache_hit,
          retry_count, country, parameters, session_id,
          sequence_number, error_type
        ) VALUES (
          NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )`,
        [
          event.timestamp_hour,
          event.version,
          event.tool,
          event.status,
          event.analytics_level,
          event.response_time_ms || null,
          event.service || null,
          event.cache_hit ?? null,
          event.retry_count || null,
          event.country || null,
          event.parameters || null,
          event.session_id || null,
          event.sequence_number || null,
          event.error_type || null
        ]
      );
    }

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAggregations(events: any[]): Promise<void> {
  // Update daily_aggregations table
  // This can run async, doesn't need to block ingestion
  const client = await pool.connect();

  try {
    // Group events by date, tool, version, country
    // Calculate counts, percentiles, etc.
    // UPSERT into daily_aggregations

    // Implementation details...

  } finally {
    client.release();
  }
}
```

---

## 6. Infrastructure & Deployment

### 6.1 Docker Compose Setup

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    restart: unless-stopped

  api:
    build: .
    environment:
      - NODE_ENV=production
      - PORT=3000
      - REDIS_HOST=redis
      - DB_HOST=postgres
      - DB_NAME=analytics
      - DB_USER=analytics
      - DB_PASSWORD=${DB_PASSWORD}
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  worker:
    build: .
    command: npm run worker
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - DB_HOST=postgres
      - DB_NAME=analytics
      - DB_USER=analytics
      - DB_PASSWORD=${DB_PASSWORD}
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  postgres:
    image: timescale/timescaledb:latest-pg16
    environment:
      - POSTGRES_DB=analytics
      - POSTGRES_USER=analytics
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  redis_data:
  postgres_data:
  grafana_data:
```

### 6.2 Nginx Configuration

**File:** `nginx/nginx.conf`

```nginx
events {
  worker_connections 1024;
}

http {
  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api:10m rate=60r/m;
  limit_req_zone $binary_remote_addr zone=burst:10m rate=10r/s;

  # Do NOT log IP addresses (privacy)
  log_format privacy '$time_local "$request" $status $body_bytes_sent';
  access_log /var/log/nginx/access.log privacy;

  upstream api {
    server api:3000;
  }

  server {
    listen 80;
    server_name analytics.weather-mcp.com;

    # Redirect to HTTPS
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name analytics.weather-mcp.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Event ingestion
    location /v1/events {
      limit_req zone=api burst=10 nodelay;

      proxy_pass http://api;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

      # Max body size
      client_max_body_size 100k;
    }

    # Public stats (higher rate limit)
    location /v1/stats {
      limit_req zone=burst burst=20 nodelay;
      proxy_pass http://api;

      # Cache for 5 minutes
      proxy_cache_valid 200 5m;
    }

    # Health check (no rate limit)
    location /v1/health {
      proxy_pass http://api;
    }
  }
}
```

### 6.3 Hosting Options

#### Option 1: DigitalOcean Droplet (Recommended for Start)

**Specs:**
- **Size**: Basic ($6/month)
  - 1 vCPU
  - 1 GB RAM
  - 25 GB SSD
  - 1 TB transfer

**Monthly Cost Breakdown:**
- Droplet: $6
- Domain: ~$1 (if needed)
- Cloudflare: $0 (free tier)
- **Total: ~$7/month**

**Pros:**
- Simple setup
- Predictable costs
- Full control
- Easy to scale

**Cons:**
- Manual management
- Single point of failure (acceptable for analytics)

#### Option 2: AWS Lightsail

**Specs:**
- **Size**: $5/month
  - 1 vCPU
  - 512 MB RAM
  - 20 GB SSD

**Monthly Cost:**
- Instance: $5
- Data transfer: ~$1
- **Total: ~$6/month**

#### Option 3: Serverless (AWS Lambda + DynamoDB)

**Not recommended because:**
- More complex
- Variable costs
- Cold starts
- Overkill for this use case

**Recommendation**: Start with DigitalOcean Droplet, migrate to dedicated server if traffic grows.

### 6.4 Deployment Process

```bash
# Initial setup
git clone https://github.com/dgahagan/weather-mcp-analytics.git
cd weather-mcp-analytics

# Configure environment
cp .env.example .env
nano .env  # Set DB_PASSWORD, etc.

# Start services
docker-compose up -d

# Initialize database
docker-compose exec postgres psql -U analytics -d analytics -f /docker-entrypoint-initdb.d/init.sql

# Verify health
curl https://analytics.weather-mcp.com/v1/health

# Monitor logs
docker-compose logs -f
```

---

## 7. Security Implementation

### 7.1 Rate Limiting Strategy

| Endpoint | Limit | Burst | Rationale |
|----------|-------|-------|-----------|
| POST /v1/events | 60/min | 10 | Normal MCP server usage |
| GET /v1/stats/* | 600/min | 20 | Public dashboard queries |
| GET /v1/health | Unlimited | - | Monitoring |

### 7.2 DDoS Protection

1. **Cloudflare Free Tier**:
   - Layer 3/4 DDoS protection
   - Layer 7 mitigation
   - Rate limiting
   - IP reputation filtering

2. **Application Level**:
   - Request size limits (100KB)
   - Connection timeouts (5s)
   - Slow request protection

3. **Database Protection**:
   - Connection pooling (max 10)
   - Query timeouts
   - Statement limits

### 7.3 Privacy Protection

1. **No IP Logging**:
   - Nginx logs use custom format (no IPs)
   - Application never logs client IPs
   - Database has no IP column

2. **Data Validation**:
   - Reject events with PII
   - Allowlist for parameters
   - Schema enforcement

3. **Secure Connections**:
   - TLS 1.2+ only
   - HSTS headers
   - Certificate pinning (optional)

---

## 8. Monitoring & Observability

### 8.1 Metrics to Track

**System Health:**
- API response times (p50, p95, p99)
- Error rates
- Queue depth
- Database connection pool usage
- Disk usage

**Business Metrics:**
- Events ingested per minute
- Unique MCP server versions
- Tool usage distribution
- Error type frequencies

### 8.2 Grafana Dashboards

**Dashboard 1: System Health**
- Request rate graph
- Error rate graph
- Queue depth over time
- Database query performance

**Dashboard 2: Product Analytics**
- Total events (last 24h, 7d, 30d)
- Tool usage pie chart
- Success rate by tool
- Top error types
- Geographic distribution (country level)

**Dashboard 3: Performance**
- Response time percentiles
- Cache hit rates
- API service usage (NOAA vs Open-Meteo)
- Slow queries

### 8.3 Alerting Rules

```yaml
# Example Prometheus alerts
groups:
  - name: analytics
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "Error rate above 5%"

      - alert: QueueBacklog
        expr: redis_queue_length > 5000
        for: 10m
        annotations:
          summary: "Event queue backing up"

      - alert: DatabaseDiskFull
        expr: disk_usage_percent > 85
        annotations:
          summary: "Database disk usage above 85%"
```

---

## 9. Public Dashboard

### 9.1 Dashboard Features

**Public URL**: `https://analytics.weather-mcp.com/dashboard`

**Sections:**
1. **Overview**
   - Total events processed
   - Active installations (estimated)
   - Uptime
   - Success rate

2. **Tool Usage**
   - Bar chart of tool call counts
   - Trend over time
   - Success rates by tool

3. **Performance**
   - Average response times
   - Cache hit rates
   - API service distribution

4. **Errors**
   - Error types and frequencies
   - Trends
   - Affected tools

5. **Geographic Distribution**
   - World map with country-level data
   - Regional performance differences

### 9.2 Dashboard Tech Stack

- **Frontend**: React + TypeScript
- **Charting**: Recharts or Chart.js
- **Styling**: Tailwind CSS
- **Hosting**: Same server, separate Docker container
- **Updates**: Real-time via WebSocket (optional) or polling

---

## 10. Cost Analysis

### 10.1 Infrastructure Costs (Monthly)

| Item | Cost | Notes |
|------|------|-------|
| VPS (DigitalOcean) | $6.00 | 1 vCPU, 1GB RAM |
| Domain | $1.00 | If needed (can use subdomain) |
| Cloudflare | $0.00 | Free tier |
| Backup storage | $1.00 | Optional |
| **Total** | **$7-8/month** | |

### 10.2 Scaling Costs

**At 100 MCP server installations:**
- ~10,000 events/day
- ~300,000 events/month
- Current setup handles easily

**At 1,000 installations:**
- ~100,000 events/day
- ~3M events/month
- Upgrade to $12/month droplet (2GB RAM)

**At 10,000 installations:**
- ~1M events/day
- ~30M events/month
- Upgrade to $48/month (8GB RAM, 4 vCPU)
- Or: Separate DB server ($24/month)

### 10.3 ROI Analysis

**Benefits:**
- Faster bug detection: ~30% reduction in MTTR
- Better feature prioritization: Focus on most-used tools
- Performance optimization: Data-driven improvements
- User trust: Transparency builds confidence

**Costs:**
- Infrastructure: $7/month
- Development time: ~40 hours (one-time)
- Maintenance: ~2 hours/month

**Net value**: Positive if helps improve even 1 user's experience

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
// tests/unit/validation.test.ts
describe('Event Validation', () => {
  it('should reject events with PII', () => {
    const event = {
      version: '1.6.1',
      tool: 'get_forecast',
      latitude: 40.7,  // PII
      longitude: -74.0  // PII
    };

    const result = validateEventBatch([event]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('PII');
  });

  it('should accept valid minimal event', () => {
    const event = {
      version: '1.6.1',
      tool: 'get_forecast',
      status: 'success',
      timestamp_hour: '2025-11-10T14:00:00Z',
      analytics_level: 'minimal'
    };

    const result = validateEventBatch([event]);
    expect(result.valid).toBe(true);
  });
});
```

### 11.2 Integration Tests

```typescript
// tests/integration/api.test.ts
describe('API Integration', () => {
  it('should accept and process event batch', async () => {
    const response = await fetch('http://localhost:3000/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            version: '1.6.1',
            tool: 'get_forecast',
            status: 'success',
            timestamp_hour: '2025-11-10T14:00:00Z',
            analytics_level: 'minimal'
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('accepted');
  });

  it('should enforce rate limits', async () => {
    // Send 61 requests in 1 minute
    const promises = Array.from({ length: 61 }, () =>
      fetch('http://localhost:3000/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [/* ... */] })
      })
    );

    const responses = await Promise.all(promises);
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

### 11.3 Load Tests

Use Apache Bench or k6:

```bash
# Test 1000 requests, 10 concurrent
ab -n 1000 -c 10 -p event.json \
  -T application/json \
  https://analytics.weather-mcp.com/v1/events
```

**Acceptance Criteria:**
- Handle 100 req/s without errors
- p95 response time < 100ms
- No memory leaks over 1 hour

---

## 12. Privacy Compliance Checklist

- [ ] No PII collected (coordinates, location names, user IDs)
- [ ] No IP address logging
- [ ] Anonymous session tracking only
- [ ] Data retention policy documented and enforced
- [ ] Privacy policy published
- [ ] GDPR compliant (no consent needed - truly anonymous)
- [ ] CCPA compliant (anonymous data exempt)
- [ ] Right to erasure: N/A (no personal data)
- [ ] Data portability: N/A (no personal data)
- [ ] Open source code for auditability
- [ ] Security measures documented
- [ ] Breach notification plan: N/A (no personal data to breach)

---

## 13. Launch Checklist

### Pre-Launch
- [ ] Complete API implementation
- [ ] Complete worker implementation
- [ ] Database schema created and tested
- [ ] Docker Compose setup verified
- [ ] All unit tests passing (100% coverage on critical paths)
- [ ] Integration tests passing
- [ ] Load tests passing
- [ ] Security audit completed
- [ ] Privacy review completed
- [ ] Documentation complete

### Infrastructure Setup
- [ ] VPS provisioned
- [ ] Docker and Docker Compose installed
- [ ] Domain/subdomain configured
- [ ] SSL certificate obtained (Let's Encrypt)
- [ ] Cloudflare DNS configured
- [ ] Firewall rules configured

### Deployment
- [ ] Environment variables configured
- [ ] Secrets generated (DB password, etc.)
- [ ] Services deployed via Docker Compose
- [ ] Database initialized
- [ ] Health check passing
- [ ] Monitoring configured (Grafana)
- [ ] Alerts configured

### Post-Launch
- [ ] Monitor for first 24 hours
- [ ] Verify no errors in logs
- [ ] Check database growth rate
- [ ] Test from MCP server (send test events)
- [ ] Verify public dashboard works
- [ ] Announce to users (README update)

---

## 14. Future Enhancements

### v1.1 (Month 2)
- [ ] Public dashboard with charts
- [ ] Email alerts for critical errors
- [ ] Automated backups

### v1.2 (Month 3)
- [ ] Real-time WebSocket updates
- [ ] Error correlation analysis
- [ ] Performance regression detection

### v2.0 (Month 6)
- [ ] Multi-region deployment
- [ ] Advanced analytics (ML for anomaly detection)
- [ ] User feedback integration
- [ ] A/B testing framework support

---

## 15. Open Questions

1. **Domain name**: Use subdomain of weather-mcp.com or separate domain?
   - Recommendation: `analytics.weather-mcp.com`

2. **Public vs Private dashboard**: Should all stats be public?
   - Recommendation: Yes, transparency builds trust

3. **Backup strategy**: How often to backup database?
   - Recommendation: Daily snapshots, 7-day retention

4. **Geographic expansion**: Support non-US data centers?
   - Recommendation: Start US-only, expand if needed

5. **Commercial use**: Allow other projects to use this analytics server?
   - Recommendation: Yes, open source it

---

## Conclusion

This analytics collection server is designed to be:
- **Simple**: Easy to deploy and maintain
- **Cheap**: < $10/month to operate
- **Secure**: Rate limiting, DDoS protection, no user tracking
- **Private**: No PII, no IP logging, GDPR/CCPA compliant
- **Transparent**: Public dashboard, open source code
- **Scalable**: Can handle thousands of MCP installations

The server complements the MCP server analytics implementation to provide valuable insights while strictly protecting user privacy.

**Next Steps:**
1. Review both plans (MCP + Server)
2. Set up development environment
3. Begin implementation (Phase 1)
4. Deploy to staging for testing
5. Launch to production

**Timeline**: 6-8 weeks from start to production launch

---

**Document Version**: 1.0
**Last Updated**: 2025-11-10
**Review Date**: 2025-12-10 (1 month)
