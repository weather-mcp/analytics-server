# Weather MCP Analytics Server

Privacy-first analytics collection server for the Weather MCP project.

## Overview

This server collects anonymous usage analytics from Weather MCP server instances to help improve the product while strictly protecting user privacy. It consists of:

- **API Service**: Fastify-based REST API for receiving analytics events and serving stats
- **Worker Process**: Background job processor for database writes and aggregations
- **Database**: PostgreSQL with TimescaleDB for efficient time-series storage
- **Queue**: Redis for buffering and async processing
- **Monitoring**: Prometheus metrics + Grafana dashboards for operational observability

**Note:** The public-facing analytics dashboard is hosted separately in the [website project](https://github.com/weather-mcp/website). This server provides the backend API that the website consumes.

## Architecture

```
MCP Servers → API Service → Redis Queue → Worker → PostgreSQL/TimescaleDB
       |          ↓                |                        ↓
       |    Prometheus ←───────────┘              Public Stats API
       |          ↓                                        ↓
       |      Grafana                              Website Dashboard
       |    (ops monitoring)                     (public analytics)
       └──────────────────────────────────────────────────┘
```

## Privacy Principles

- **No PII Collection**: No coordinates, location names, or user identifiers
- **No IP Logging**: Application configured to never log IP addresses
- **Anonymous Only**: All data truly anonymous and cannot be linked to users
- **Opt-in**: Analytics disabled by default in MCP servers
- **Transparent**: All collection code is open source and auditable

## Features

### API Endpoints

- `POST /v1/events` - Event ingestion (rate limited: 60/min)
- `GET /v1/health` - Health check
- `GET /v1/status` - Detailed system status
- `GET /v1/stats/overview` - Summary statistics
- `GET /v1/stats/tools` - Tool usage stats
- `GET /v1/stats/tool/:toolName` - Specific tool stats
- `GET /v1/stats/errors` - Error statistics
- `GET /v1/stats/performance` - Performance metrics
- `GET /metrics` - Prometheus metrics

### Operational Monitoring

- **Prometheus** for metrics collection (30-day retention)
- **Grafana** for operational dashboards (3 dashboards included):
  - API Health (request rate, errors, response times)
  - Worker & Queue (queue depth, processing stats, errors)
  - Database & Infrastructure (query performance, connections, resources)
- **Alertmanager** for notifications (email, Slack)
- **15+ alert rules** across 6 groups (API, queue, worker, database, resources, data freshness)
- Auto-refresh dashboards (10-second intervals)

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify
- **Database**: PostgreSQL 16 + TimescaleDB 2.x
- **Queue**: Redis 7
- **Monitoring**: Prometheus + Grafana + Alertmanager
- **Container**: Docker + Docker Compose
- **Reverse Proxy**: Nginx (production)
- **Logging**: Pino (structured JSON logging)

## Quick Start with Docker

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/weather-mcp/analytics-server.git
cd analytics-server

# Create environment file
cp .env.example .env
nano .env  # Edit configuration
```

### 2. Start All Services

```bash
# Build and start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Verify health
curl http://localhost:3000/v1/health
```

### 3. Access Services

- **API**: http://localhost:3000
- **API Health**: http://localhost:3000/v1/health
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **Alertmanager**: http://localhost:9093

## Development Setup

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- PostgreSQL 16 with TimescaleDB (or use Docker)
- Redis 7 (or use Docker)

### 1. Install Dependencies

```bash
# Install API server dependencies
npm install

# Install dashboard dependencies
cd dashboard
npm install
cd ..
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Redis only
docker-compose up -d postgres redis

# Wait for services to be ready
./scripts/start-dev.sh
```

### 3. Initialize Database

```bash
# Run database initialization
./scripts/init-db.sh

# Or manually:
npm run build
node dist/database/migrations.js
```

### 4. Start Development Servers

```bash
# Terminal 1: API Server (with hot reload)
npm run dev

# Terminal 2: Worker Process (with hot reload)
npm run dev:worker

# Terminal 3: Dashboard (with hot reload)
cd dashboard
npm run dev
```

### 5. Run Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration

# Generate coverage report
npm run test:coverage
```

## Configuration

All configuration is done via environment variables. See `.env.example` for all available options.

### Key Configuration Options

```bash
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=analytics
DB_USER=analytics
DB_PASSWORD=your-secure-password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API
RATE_LIMIT_PER_MINUTE=60
MAX_BATCH_SIZE=100
API_BODY_LIMIT_KB=100

# Security
TRUST_PROXY=true
CORS_ORIGIN=*
```

## API Usage

### Event Ingestion

```bash
curl -X POST http://localhost:3000/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "version": "1.0.0",
        "tool": "get_forecast",
        "status": "success",
        "timestamp_hour": "2025-11-12T20:00:00Z",
        "analytics_level": "standard",
        "response_time_ms": 150,
        "service": "noaa",
        "cache_hit": true,
        "country": "US"
      }
    ]
  }'
```

### Get Statistics

```bash
# Overview
curl http://localhost:3000/v1/stats/overview?period=30d

# Tool stats
curl http://localhost:3000/v1/stats/tools?period=7d

# Performance
curl http://localhost:3000/v1/stats/performance?period=90d
```

## Project Structure

```
analytics-server/
├── src/
│   ├── api/              # Fastify API server
│   │   ├── index.ts      # Main server with routes
│   │   ├── stats.ts      # Stats query functions
│   │   └── validation.ts # Event validation
│   ├── worker/           # Event processing worker
│   │   └── index.ts      # Worker main loop
│   ├── database/         # PostgreSQL interactions
│   │   ├── index.ts      # Connection pool & queries
│   │   └── migrations.ts # Database migrations
│   ├── queue/            # Redis queue management
│   │   └── index.ts      # Queue operations
│   ├── monitoring/       # Prometheus metrics
│   │   └── metrics.ts    # Metrics definitions
│   ├── utils/            # Utilities
│   │   └── logger.ts     # Structured logging (Pino)
│   ├── types/            # TypeScript types
│   │   └── events.ts     # Event type definitions
│   └── config.ts         # Configuration loader
├── dashboard/            # React dashboard
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── api.ts        # API client
│   │   ├── types.ts      # TypeScript types
│   │   └── App.tsx       # Main app
│   └── dist/             # Production build
├── tests/
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── scripts/              # Utility scripts
│   ├── init-db.sh        # Database initialization
│   └── start-dev.sh      # Development startup
├── docker-compose.yml    # Docker Compose config
├── Dockerfile            # Container image (API/Worker)
└── init.sql              # Database schema
```

## Testing

```bash
# Run all tests (76 tests total)
npm test

# Run with coverage
npm run test:coverage

# Run specific test files
npm test -- tests/integration/api.test.ts
npm test -- tests/integration/database.test.ts
npm test -- tests/integration/stats-api.test.ts
```

### Test Coverage

- **Database Tests**: 32 tests (insertions, aggregations, migrations)
- **API Tests**: 18 tests (validation, rate limiting, health checks)
- **Stats API Tests**: 19 tests (endpoints, caching, filtering)
- **Unit Tests**: 7 tests (validation logic, utilities)

## Monitoring

The analytics server includes comprehensive operational monitoring for infrastructure health and performance.

### Prometheus Metrics

The `/metrics` endpoint exposes the following metrics:

- `http_requests_total` - Total HTTP requests by route and status
- `http_request_duration_seconds` - Request duration histogram
- `events_received_total` - Events received by analytics level and tool
- `events_processed_total` - Events processed (success/error)
- `queue_depth` - Current queue depth gauge
- `database_connection_pool` - Connection pool stats (total, idle, waiting)
- `database_query_duration_seconds` - Query performance histogram
- `cache_operations_total` - Cache hits/misses
- `worker_batch_size` - Worker batch size distribution
- `worker_errors_total` - Worker errors by type
- Plus Node.js default metrics (CPU, memory, GC, event loop, etc.)

### Grafana Dashboards

Three pre-configured operational dashboards are included:

1. **API Health Dashboard**: Request rates, error rates, response times (p50/p95/p99), uptime
2. **Worker & Queue Dashboard**: Queue depth, processing rates, batch sizes, worker errors
3. **Database & Infrastructure Dashboard**: Query performance, connection pool, cache hit rates, memory/CPU

All dashboards auto-refresh every 10 seconds and include color-coded alerts.

**See:** [MONITORING_GUIDE.md](docs/MONITORING_GUIDE.md) for complete monitoring documentation.

## Data Retention

Configured via TimescaleDB retention policies:

- **Raw events**: 90 days (auto-deleted)
- **Daily aggregations**: 2 years
- **Hourly aggregations**: 30 days
- **Error summaries**: 90 days

## Production Deployment

The analytics server is production-ready and includes comprehensive deployment infrastructure.

### Quick Production Deployment

```bash
# 1. Clone and configure
git clone https://github.com/weather-mcp/analytics-server.git
cd analytics-server
cp .env.example .env
nano .env  # Update with production values

# 2. Start with production configuration
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 3. Verify deployment
./scripts/health-check.sh
```

### Production Features

- **Docker Compose** with production overrides (resource limits, security hardening)
- **Nginx Reverse Proxy** with SSL/TLS, rate limiting, privacy-first logging
- **Automated Database Backups** (7-day retention, compression, verification)
- **Health Monitoring Scripts** (API, database, Redis, disk space)
- **Cron Job Setup** (automated backups and maintenance)
- **Resource Limits** for all services (CPU, memory)
- **Log Rotation** configuration
- **Security Hardening** (internal-only ports, TLS 1.2+, HSTS)

### Comprehensive Documentation

- **[DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)** - Complete VPS deployment walkthrough (5,500+ words)
- **[PRE_DEPLOYMENT_CHECKLIST.md](docs/PRE_DEPLOYMENT_CHECKLIST.md)** - 80+ verification items
- **[OPERATIONS_GUIDE.md](docs/OPERATIONS_GUIDE.md)** - Daily operations and maintenance (4,000+ words)
- **[MONITORING_GUIDE.md](docs/MONITORING_GUIDE.md)** - Monitoring and observability (7,000+ words)

### Quick Security Checklist

- [ ] Change default database password in `.env`
- [ ] Configure firewall (UFW)
- [ ] Set up SSL/TLS certificates (Let's Encrypt recommended)
- [ ] Update Grafana admin password
- [ ] Configure Alertmanager email notifications
- [ ] Set up automated backups (run `./scripts/setup-cron.sh`)
- [ ] Verify rate limiting is working
- [ ] Review and update CORS origins

**See the full security checklist in [PRE_DEPLOYMENT_CHECKLIST.md](docs/PRE_DEPLOYMENT_CHECKLIST.md)**

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Test connection
PGPASSWORD=$DB_PASSWORD psql -h localhost -U analytics -d analytics
```

### Queue Issues

```bash
# Check Redis
docker-compose ps redis

# Check queue depth
docker-compose exec redis redis-cli LLEN analytics:events

# Clear queue (development only!)
docker-compose exec redis redis-cli DEL analytics:events
```

### Worker Not Processing Events

```bash
# Check worker logs
docker-compose logs worker

# Restart worker
docker-compose restart worker

# Check for errors in database
docker-compose logs postgres | grep ERROR
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Write tests for all new features
- Follow existing code style (ESLint + Prettier)
- Update documentation
- Ensure all tests pass
- Add TypeScript types for all functions

## License

MIT License - see [LICENSE](LICENSE) file for details

## Documentation

Comprehensive documentation is included:

### User Documentation
- **[README.md](README.md)** - This file (project overview and quick start)
- **[API.md](docs/API.md)** - Complete API reference with examples
- **[PRIVACY_POLICY.md](PRIVACY_POLICY.md)** - Privacy policy and data handling

### Deployment Documentation
- **[DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)** - VPS deployment walkthrough (5,500+ words)
- **[PRE_DEPLOYMENT_CHECKLIST.md](docs/PRE_DEPLOYMENT_CHECKLIST.md)** - 80+ pre-launch verification items
- **[OPERATIONS_GUIDE.md](docs/OPERATIONS_GUIDE.md)** - Daily operations and maintenance (4,000+ words)

### Monitoring Documentation
- **[MONITORING_GUIDE.md](docs/MONITORING_GUIDE.md)** - Complete monitoring guide (7,000+ words)
- **[POST_LAUNCH_MONITORING.md](POST_LAUNCH_MONITORING.md)** - Post-launch monitoring plan

### Technical Documentation
- **[TESTING_GUIDE.md](docs/TESTING_GUIDE.md)** - Testing strategy and execution
- **[TEST_COVERAGE_FINAL_REPORT.md](docs/TEST_COVERAGE_FINAL_REPORT.md)** - Complete coverage analysis
- **[API_INTEGRATION_GUIDE.md](docs/API_INTEGRATION_GUIDE.md)** - Integration guide for website developers
- **[TYPESCRIPT_TYPES.md](docs/TYPESCRIPT_TYPES.md)** - TypeScript type definitions guide
- **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** - Detailed implementation roadmap

### Phase Completion Reports
- **[PHASE_6_COMPLETION_REPORT.md](PHASE_6_COMPLETION_REPORT.md)** - Deployment & Infrastructure
- **[PHASE_7_COMPLETION_REPORT.md](PHASE_7_COMPLETION_REPORT.md)** - Monitoring & Observability
- **[PHASE_9_COMPLETION_REPORT.md](PHASE_9_COMPLETION_REPORT.md)** - Launch Preparation

## Links

- **GitHub Organization**: https://github.com/weather-mcp
- **Weather MCP Server**: https://github.com/weather-mcp/mcp-server
- **Analytics Server**: https://github.com/weather-mcp/analytics-server
- **Website**: https://github.com/weather-mcp/website
- **Public Dashboard**: https://weather-mcp.dev/dashboard *(coming soon)*

## Support

For issues and questions:
- **Analytics Server Issues**: https://github.com/weather-mcp/analytics-server/issues
- **MCP Server Issues**: https://github.com/weather-mcp/mcp-server/issues
- **General Questions**: https://github.com/weather-mcp/.github/discussions

---

**Status**: ✅ Production Ready (Phase 9 Complete)

**Last Updated**: 2025-01-13
**Version**: 1.0.0
**Test Coverage**: 86-100% on critical modules (266 tests passing)
