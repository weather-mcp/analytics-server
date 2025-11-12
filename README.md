# Weather MCP Analytics Server

Privacy-first analytics collection server for the Weather MCP project.

## Overview

This server collects anonymous usage analytics from Weather MCP server instances to help improve the product while strictly protecting user privacy. It consists of:

- **API Service**: Fastify-based REST API for receiving analytics events
- **Worker Process**: Background job processor for database writes and aggregations
- **Database**: PostgreSQL with TimescaleDB for efficient time-series storage
- **Queue**: Redis for buffering and async processing
- **Dashboard**: React-based real-time analytics dashboard

## Architecture

```
MCP Servers → API Service → Redis Queue → Worker → PostgreSQL/TimescaleDB
                  ↓                                        ↓
            Prometheus Metrics                   Public Dashboard API
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

### Dashboard

- Real-time analytics visualization
- Interactive charts (Bar, Pie)
- Period filtering (7d, 30d, 90d)
- Auto-refresh every 30 seconds
- Mobile-responsive design

### Monitoring

- Prometheus metrics export
- Database connection pool monitoring
- Queue depth tracking
- Request/response metrics
- Event processing metrics

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Database**: PostgreSQL 16 + TimescaleDB
- **Queue**: Redis 7
- **Monitoring**: Prometheus + Grafana (optional)
- **Container**: Docker + Docker Compose

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
- **Dashboard**: http://localhost:5173
- **Prometheus Metrics**: http://localhost:3000/metrics

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

### Prometheus Metrics

The `/metrics` endpoint exposes the following metrics:

- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request duration histogram
- `events_received_total` - Events received by analytics level
- `events_processed_total` - Events processed (success/error)
- `queue_depth` - Current queue depth
- `database_connection_pool` - Connection pool stats
- `cache_operations_total` - Cache hits/misses
- Plus Node.js default metrics (CPU, memory, GC, etc.)

### Grafana Dashboard (Optional)

```bash
# Add Grafana to docker-compose
docker-compose up -d grafana

# Access at http://localhost:3001
# Default credentials: admin/admin
```

Import the provided dashboard JSON from `monitoring/grafana-dashboard.json`.

## Data Retention

Configured via TimescaleDB retention policies:

- **Raw events**: 90 days (auto-deleted)
- **Daily aggregations**: 2 years
- **Hourly aggregations**: 30 days
- **Error summaries**: 90 days

## Production Deployment

### Digital Ocean Deployment

1. **Create Droplet** ($6/month Basic plan)
   - Ubuntu 22.04 LTS
   - 1 GB RAM / 25 GB SSD

2. **Install Docker**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl enable docker
```

3. **Clone and Configure**
```bash
git clone https://github.com/weather-mcp/analytics-server.git
cd analytics-server
cp .env.example .env
nano .env  # Configure for production
```

4. **Start Services**
```bash
docker-compose -f docker-compose.yml up -d
```

5. **Configure Nginx** (on host)
   - Set up reverse proxy
   - Configure SSL with Let's Encrypt
   - Enable rate limiting

### Security Checklist

- [ ] Change default database password
- [ ] Configure firewall (UFW)
- [ ] Set up SSL/TLS certificates
- [ ] Enable Nginx rate limiting
- [ ] Configure Cloudflare proxy (optional)
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Enable monitoring alerts

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

## Links

- [Weather MCP Server](https://github.com/weather-mcp/mcp-server)
- [Website](https://weather-mcp.dev)
- [Dashboard](https://weather-mcp.dev/dashboard)
- [Implementation Plan](./IMPLEMENTATION_PLAN.md)

## Support

For issues and questions:
- GitHub Issues: https://github.com/weather-mcp/analytics-server/issues
- MCP Server Issues: https://github.com/weather-mcp/mcp-server/issues

---

**Status**: ✅ Production Ready

Last Updated: 2025-11-12
