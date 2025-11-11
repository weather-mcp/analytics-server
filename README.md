# Weather MCP Analytics Server

Privacy-first analytics collection server for the Weather MCP project.

## Overview

This server collects anonymous usage analytics from Weather MCP server instances to help improve the product while strictly protecting user privacy. It consists of:

- **API Service**: Fastify-based REST API for receiving analytics events
- **Worker Process**: Background job processor for database writes and aggregations
- **Database**: PostgreSQL with TimescaleDB for efficient time-series storage
- **Queue**: Redis for buffering and async processing

## Architecture

```
MCP Servers → Nginx → API Service → Redis Queue → Worker → PostgreSQL/TimescaleDB
                                                           ↓
                                        Public Dashboard API (Read-only)
```

## Privacy Principles

- **No PII Collection**: No coordinates, location names, or user identifiers
- **No IP Logging**: Nginx and application configured to never log IPs
- **Anonymous Only**: All data truly anonymous and cannot be linked to users
- **Opt-in**: Analytics disabled by default in MCP servers
- **Transparent**: All collection code is open source and auditable

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify
- **Database**: PostgreSQL 16 + TimescaleDB
- **Queue**: Redis 7
- **Reverse Proxy**: Nginx
- **Container**: Docker + Docker Compose

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- PostgreSQL 16 with TimescaleDB extension (or use Docker)

### Development Setup

1. Install dependencies:
```bash
npm install
```

2. Start infrastructure (Redis, PostgreSQL):
```bash
docker-compose up -d redis postgres
```

3. Initialize database:
```bash
npm run db:init
```

4. Start API server:
```bash
npm run dev
```

5. Start worker (in another terminal):
```bash
npm run dev:worker
```

### Production Deployment

See full deployment guide in `../docs/deployment.md`.

Quick start with Docker Compose:

```bash
# Set environment variables
cp .env.example .env
nano .env  # Configure DB_PASSWORD, etc.

# Start all services
docker-compose up -d

# Check health
curl https://analytics.weather-mcp.dev/v1/health
```

## API Endpoints

### POST /v1/events
Accepts batched analytics events from MCP servers.

**Rate Limits**: 60 requests/min per IP, max 100 events per batch

### GET /v1/stats/overview
Returns public aggregated statistics.

### GET /v1/health
Health check endpoint.

## Configuration

Environment variables:

```bash
# API Service
PORT=3000
NODE_ENV=production

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=analytics
DB_USER=analytics
DB_PASSWORD=your-secure-password

# Analytics Endpoint (for external use)
ANALYTICS_ENDPOINT=https://analytics.weather-mcp.dev/v1/events
```

## Testing

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

## Project Structure

```
analytics-server/
├── src/
│   ├── api/           # Fastify API server
│   ├── worker/        # Event processing worker
│   ├── database/      # PostgreSQL interactions
│   ├── queue/         # Redis queue management
│   ├── logger/        # Structured logging (Pino)
│   └── types/         # TypeScript type definitions
├── tests/
│   ├── unit/          # Unit tests
│   └── integration/   # Integration tests
├── scripts/           # Deployment and maintenance scripts
├── docker-compose.yml # Container orchestration
├── Dockerfile         # Container image
└── init.sql          # Database schema initialization
```

## Monitoring

- **Grafana Dashboard**: http://localhost:3001 (default credentials in docker-compose.yml)
- **Logs**: `docker-compose logs -f api worker`
- **Metrics**: Prometheus endpoint at `/metrics`

## Data Retention

- **Raw events**: 90 days (auto-deleted via TimescaleDB policy)
- **Daily aggregations**: 2 years
- **Hourly aggregations**: 30 days
- **Error summaries**: 90 days

## Security

- TLS 1.2+ required
- Rate limiting enforced
- Request size limits (100KB)
- DDoS protection via Cloudflare
- No authentication (truly anonymous)

## Contributing

See `../docs/contributing.md` for contribution guidelines.

## License

MIT

## Links

- [Full Implementation Plan](./ANALYTICS_SERVER_PLAN.md)
- [MCP Server Integration](https://github.com/weather-mcp/mcp-server/blob/main/docs/ANALYTICS_MCP_PLAN.md)
- [MCP Server Repository](https://github.com/weather-mcp/mcp-server)
- [Website Repository](https://github.com/weather-mcp/website)
- [Public Website](https://weather-mcp.dev)
- [Analytics Dashboard](https://weather-mcp.dev/dashboard)
