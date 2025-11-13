# Testing Guide
## Analytics Server - Quick Reference

This guide provides quick commands and troubleshooting for running tests in the analytics-server project.

---

## Quick Start

### Run Unit Tests (Recommended)

```bash
# All unit tests (fastest, no infrastructure needed)
npm run test:unit

# With coverage report
npx vitest run tests/unit --coverage

# Watch mode for development
npx vitest tests/unit --watch
```

**Expected Result:** 213 tests passing in ~3 seconds

### Run Integration Tests (Requires Infrastructure)

```bash
# Step 1: Start infrastructure
docker-compose up -d postgres redis

# Step 2: Wait for health checks (30 seconds)
sleep 30
docker-compose ps

# Step 3: Run integration tests
npm run test:integration

# Step 4: Cleanup
docker-compose down
```

**Expected Result:** 53 tests passing in ~5 seconds

### Run All Tests

```bash
# Unit + Integration (infrastructure must be running)
npm test

# With coverage
npm run test:coverage
```

---

## Test Commands Reference

| Command | What It Does | Requirements |
|---------|-------------|--------------|
| `npm test` | Run all tests (unit + integration) | PostgreSQL + Redis |
| `npm run test:unit` | Run only unit tests | None |
| `npm run test:integration` | Run only integration tests | PostgreSQL + Redis |
| `npm run test:coverage` | Generate coverage report | None for unit tests |
| `npx vitest --ui` | Open Vitest UI (interactive) | None |
| `npx vitest tests/unit/config.test.ts` | Run specific test file | None |

---

## Infrastructure Setup

### Using Docker Compose (Recommended)

```bash
# Start all services (PostgreSQL, Redis, API, Worker)
docker-compose up -d

# Start only database services
docker-compose up -d postgres redis

# Check status
docker-compose ps

# View logs
docker-compose logs -f postgres
docker-compose logs -f redis

# Stop services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Manual Infrastructure (Advanced)

```bash
# PostgreSQL with TimescaleDB
docker run -d \
  --name analytics-postgres \
  -e POSTGRES_DB=analytics \
  -e POSTGRES_USER=analytics \
  -e POSTGRES_PASSWORD=test_password \
  -p 5432:5432 \
  timescale/timescaledb:latest-pg16

# Redis
docker run -d \
  --name analytics-redis \
  -p 6379:6379 \
  redis:7-alpine
```

---

## Test Environment Configuration

Tests use `.env.test` file for configuration:

```bash
# Location: /home/dgahagan/work/personal/weather-mcp/analytics-server/.env.test

NODE_ENV=test
DB_HOST=localhost
DB_PORT=5432
DB_USER=analytics
DB_NAME=analytics
DB_PASSWORD=test_password
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Note:** Unit tests use mocks and don't connect to real services. Integration tests use these credentials.

---

## Troubleshooting

### Issue: "MaxListenersExceededWarning"

**Symptom:**
```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected
```

**Solution:**
This warning has been fixed in `tests/setup.ts`. If you still see it, verify:
```bash
grep -n "setMaxListeners" tests/setup.ts
# Should show: process.setMaxListeners(20);
```

### Issue: Integration Tests Fail with "password authentication failed"

**Symptom:**
```
error: password authentication failed for user "analytics"
```

**Solution:**
1. Check Docker containers are running: `docker-compose ps`
2. Verify database password in `.env.test` matches `docker-compose.yml`
3. Try restarting containers: `docker-compose restart postgres`
4. Check logs: `docker-compose logs postgres`

### Issue: Integration Tests Fail with "ECONNREFUSED"

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
1. Verify PostgreSQL is running: `docker ps | grep postgres`
2. Check port is not in use: `lsof -i :5432`
3. Start infrastructure: `docker-compose up -d postgres redis`
4. Wait for health checks: `sleep 30`

### Issue: Tests Hang or Timeout

**Symptom:**
Tests run indefinitely without completing

**Solution:**
1. Increase timeout in `vitest.config.ts`:
   ```typescript
   testTimeout: 30000, // 30 seconds
   ```
2. Check for async operations without await
3. Verify mocks are properly configured

### Issue: "Cannot find module" Errors

**Symptom:**
```
Error: Cannot find module '../../src/config.js'
```

**Solution:**
1. Build TypeScript: `npm run build`
2. Check file extensions (.js for imports, even from .ts files)
3. Verify tsconfig.json has correct moduleResolution

### Issue: Coverage Report Not Generated

**Symptom:**
No `coverage/` directory after running tests

**Solution:**
1. Install coverage tool: `npm install --save-dev @vitest/coverage-v8`
2. Run with coverage flag: `npx vitest run --coverage`
3. Check for errors in test output

---

## Coverage Reports

### Viewing Coverage

```bash
# Generate coverage report
npx vitest run tests/unit --coverage

# Open HTML report in browser
# Linux:
xdg-open coverage/index.html

# macOS:
open coverage/index.html

# Windows:
start coverage/index.html
```

### Coverage Locations

- **HTML Report:** `coverage/index.html` (human-readable)
- **JSON Report:** `coverage/coverage-final.json` (CI/CD)
- **Text Report:** Printed to console after test run

### Current Coverage Summary

```
Module                     | Coverage | Status
---------------------------|----------|--------
src/monitoring/metrics.ts  | 100%     | Perfect
src/api/validation.ts      | 91.83%   | Excellent
src/config.ts              | 89.91%   | Excellent
src/queue/index.ts         | 86.13%   | Good
src/worker/index.ts        | 77.04%   | Good
src/utils/logger.ts        | 75%      | Good
```

---

## CI/CD Integration

### GitHub Actions

Tests run automatically on push/PR. See workflow at `.github/workflows/test.yml` (to be created).

**Current Status:**
- Unit tests: Ready for CI
- Integration tests: Need service containers in workflow

**Recommended Workflow:**
```yaml
services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    env:
      POSTGRES_PASSWORD: test_password
    options: --health-cmd pg_isready

  redis:
    image: redis:7-alpine
    options: --health-cmd "redis-cli ping"
```

### Pre-commit Hooks

To run tests before every commit (optional):

```bash
# Install husky
npm install --save-dev husky

# Initialize
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit "npm run test:unit"
```

---

## Test File Organization

```
tests/
├── setup.ts                    # Global test setup
├── unit/                       # Unit tests (213 tests)
│   ├── config.test.ts         # Configuration (26 tests)
│   ├── validation.test.ts     # Event validation (26 tests)
│   ├── queue.test.ts          # Redis queue (20 tests)
│   ├── database.test.ts       # DB logic (16 tests)
│   ├── queries.test.ts        # Query utilities (27 tests)
│   ├── worker.test.ts         # Worker lifecycle (14 tests)
│   ├── logger.test.ts         # Logger (14 tests)
│   ├── metrics.test.ts        # Prometheus metrics (29 tests)
│   ├── migrations.test.ts     # DB migrations (10 tests)
│   └── types.test.ts          # TypeScript types (31 tests)
└── integration/               # Integration tests (53 tests)
    ├── api.test.ts            # API endpoints (18 tests)
    ├── database.test.ts       # Database operations (18 tests)
    └── stats-api.test.ts      # Stats API (17 tests)
```

---

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock external dependencies
vi.mock('../../src/queue/index.js', () => ({
  queueEvents: vi.fn(),
}));

describe('Module Name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Function Name', () => {
    it('should do something when condition is met', () => {
      // Arrange
      const input = { test: 'data' };

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../src/database/index.js';

describe('Integration Test Suite', () => {
  beforeAll(async () => {
    // Setup (run migrations, seed data, etc.)
  });

  afterAll(async () => {
    // Cleanup (delete test data, close connections)
  });

  it('should interact with real database', async () => {
    const result = await pool.query('SELECT 1');
    expect(result.rows).toHaveLength(1);
  });
});
```

---

## Performance Benchmarks

### Current Performance

| Test Suite | Tests | Duration | Status |
|------------|-------|----------|--------|
| Unit tests | 213 | 2.66s | ✅ Fast |
| Integration tests | 53 | ~5s | ✅ Acceptable |
| Total | 266 | ~8s | ✅ Good |

### Performance Tips

1. **Use mocks liberally** - Don't connect to real services in unit tests
2. **Parallel execution** - Vitest runs tests in parallel by default
3. **Avoid setTimeout** - Use vi.useFakeTimers() when possible
4. **Clean up properly** - Use afterEach to prevent memory leaks

---

## Resources

### Documentation
- **Vitest Docs:** https://vitest.dev/
- **Coverage Report:** `TEST_COVERAGE_FINAL_REPORT.md`
- **Project README:** `README.md`

### Test Reports
- **Final Report:** `/home/dgahagan/work/personal/weather-mcp/analytics-server/TEST_COVERAGE_FINAL_REPORT.md`
- **Coverage HTML:** `/home/dgahagan/work/personal/weather-mcp/analytics-server/coverage/index.html`

### Support
- GitHub Issues: https://github.com/weather-mcp/analytics-server/issues
- Test failures should be reported with full error output

---

**Last Updated:** 2025-11-13
**Test Suite Version:** v1.0 (213 unit tests, 53 integration tests)
