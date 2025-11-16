# Development Guide

Guide for developing and contributing to the Weather MCP Analytics Server.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Debugging](#debugging)
- [Contributing](#contributing)

---

## Getting Started

### Prerequisites

- Node.js 20+ LTS
- Docker and Docker Compose
- Git
- Code editor (VS Code recommended)

### Initial Setup

1. **Clone Repository**
   ```bash
   git clone https://github.com/weather-mcp/analytics-server.git
   cd analytics-server
   ```

2. **Install Dependencies**
   ```bash
   # API server dependencies
   npm install

   # Dashboard dependencies
   cd dashboard
   npm install
   cd ..
   ```

3. **Set Up Environment**
   ```bash
   cp .env.example .env
   # .env is already configured for local development
   ```

4. **Start Infrastructure**
   ```bash
   # Start PostgreSQL and Redis
   docker-compose up -d postgres redis

   # Initialize database
   ./scripts/init-db.sh
   ```

5. **Start Development Servers**
   ```bash
   # Terminal 1: API Server (with hot reload)
   npm run dev

   # Terminal 2: Worker Process (with hot reload)
   npm run dev:worker

   # Terminal 3: Dashboard (with hot reload)
   cd dashboard
   npm run dev
   ```

6. **Verify Setup**
   - API: http://localhost:3000/v1/health
   - Dashboard: http://localhost:5173
   - Metrics: http://localhost:3000/metrics

---

## Development Workflow

### Branch Strategy

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes
# ...

# Run tests
npm test

# Commit
git add .
git commit -m "feat: add my feature"

# Push
git push origin feature/my-feature

# Create Pull Request on GitHub
```

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```bash
feat(api): add caching to stats endpoints
fix(worker): handle database connection errors
docs(readme): update deployment instructions
test(validation): add tests for PII detection
```

### Development Commands

```bash
# Development
npm run dev              # Start API server with hot reload
npm run dev:worker       # Start worker with hot reload

# Building
npm run build            # Build TypeScript to JavaScript

# Testing
npm test                 # Run all tests
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:coverage    # Run tests with coverage report

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier

# Database
./scripts/init-db.sh     # Initialize database
npm run db:init          # Alternative db init
```

---

## Project Structure

```
analytics-server/
├── src/                    # Source code
│   ├── api/               # API server
│   │   ├── index.ts       # Main server
│   │   ├── stats.ts       # Stats queries
│   │   └── validation.ts  # Event validation
│   ├── worker/            # Worker process
│   │   └── index.ts       # Worker main loop
│   ├── database/          # Database layer
│   │   ├── index.ts       # Queries and connection
│   │   └── migrations.ts  # Migration system
│   ├── queue/             # Redis queue
│   │   └── index.ts       # Queue operations
│   ├── monitoring/        # Metrics
│   │   └── metrics.ts     # Prometheus metrics
│   ├── utils/             # Utilities
│   │   └── logger.ts      # Structured logging
│   ├── types/             # TypeScript types
│   │   └── events.ts      # Event types
│   └── config.ts          # Configuration
│
├── dashboard/             # React dashboard
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── api.ts         # API client
│   │   ├── types.ts       # TypeScript types
│   │   └── App.tsx        # Main app
│   └── dist/              # Production build
│
├── tests/                 # Test files
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
│
├── scripts/               # Utility scripts
│   ├── init-db.sh         # Database setup
│   └── start-dev.sh       # Development startup
│
├── docs/                  # Documentation
│
├── docker-compose.yml     # Docker services
├── Dockerfile             # API/Worker container
├── init.sql               # Database schema
├── tsconfig.json          # TypeScript config
├── package.json           # Dependencies
└── .env.example           # Environment template
```

### Key Files

- **src/api/index.ts**: Main API server with all routes
- **src/worker/index.ts**: Background worker process
- **src/database/index.ts**: All database queries
- **src/types/events.ts**: Event type definitions
- **init.sql**: Complete database schema

---

## Coding Standards

### TypeScript

- **Strict Mode**: Enabled
- **Target**: ES2022
- **Module**: ESM
- **No `any`**: Use proper types
- **Explicit Return Types**: For public functions

**Example**:
```typescript
// Good ✓
export async function getUserById(id: string): Promise<User | null> {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// Bad ✗
export async function getUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}
```

### ESLint Rules

```javascript
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "no-console": "warn"
  }
}
```

### Naming Conventions

- **Files**: kebab-case (`event-validation.ts`)
- **Classes**: PascalCase (`EventValidator`)
- **Functions**: camelCase (`validateEvent`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_BATCH_SIZE`)
- **Types**: PascalCase (`AnalyticsEvent`)

### Code Organization

1. **Imports** (grouped and sorted)
2. **Types/Interfaces**
3. **Constants**
4. **Main Code**
5. **Exports**

**Example**:
```typescript
// Imports
import { Pool } from 'pg';
import { config } from './config.js';
import type { Event } from './types.js';

// Types
interface QueryResult {
  rows: Event[];
}

// Constants
const MAX_RETRIES = 3;

// Main code
export async function getEvents(): Promise<Event[]> {
  // implementation
}
```

---

## Testing

### Test Structure

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Feature Name', () => {
  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Specific Functionality', () => {
    it('should do something specific', async () => {
      // Arrange
      const input = { /* test data */ };

      // Act
      const result = await functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Writing Tests

**Unit Tests** (`tests/unit/`):
- Test individual functions
- Mock external dependencies
- Fast execution

```typescript
// tests/unit/validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateEvent } from '../../src/api/validation.js';

describe('Event Validation', () => {
  it('should accept valid minimal event', () => {
    const event = {
      version: '1.0.0',
      tool: 'test',
      status: 'success',
      timestamp_hour: '2025-11-12T20:00:00Z',
      analytics_level: 'minimal'
    };

    const result = validateEvent(event);
    expect(result.valid).toBe(true);
  });
});
```

**Integration Tests** (`tests/integration/`):
- Test API endpoints
- Use real database/Redis
- Test full workflows

```typescript
// tests/integration/api.test.ts
import { describe, it, expect } from 'vitest';
import { server } from '../../src/api/index.js';

describe('API Integration', () => {
  it('should accept event batch', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [/* ... */] }
    });

    expect(response.statusCode).toBe(200);
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Specific file
npm test -- tests/unit/validation.test.ts

# Coverage
npm run test:coverage
```

### Test Coverage Goals

- **Overall**: >80%
- **Critical paths**: 100%
- **New features**: >90%

---

## Debugging

### VS Code Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug API Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Debugging Tips

**1. Enable Debug Logging**
```bash
LOG_LEVEL=debug npm run dev
```

**2. Check Database Queries**
```typescript
// Add to database/index.ts
pool.on('query', (query) => {
  logger.debug({ query }, 'Database query');
});
```

**3. Monitor Queue**
```bash
# Watch queue depth
docker-compose exec redis redis-cli
> LLEN analytics:events
> LRANGE analytics:events 0 -1
```

**4. Inspect Metrics**
```bash
curl http://localhost:3000/metrics | grep events_
```

### Common Issues

**Issue**: TypeScript errors
```bash
# Clear build cache
rm -rf dist/
npm run build
```

**Issue**: Database connection failed
```bash
# Check PostgreSQL
docker-compose ps postgres
docker-compose logs postgres

# Verify .env settings
cat .env | grep DB_
```

**Issue**: Redis connection refused
```bash
# Check Redis
docker-compose ps redis
docker-compose logs redis
```

---

## Contributing

### Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Add** tests for new features
5. **Run** all tests
6. **Update** documentation
7. **Commit** with conventional commits
8. **Push** to your fork
9. **Open** a Pull Request

### PR Checklist

- [ ] Tests added/updated
- [ ] All tests passing
- [ ] Documentation updated
- [ ] TypeScript compiles without errors
- [ ] Code formatted (Prettier)
- [ ] Linting passes (ESLint)
- [ ] Commit messages follow convention
- [ ] No merge conflicts

### Code Review

Reviewers will check:
- Code quality and style
- Test coverage
- Security implications
- Performance impact
- Documentation completeness

### Getting Help

- **Questions**: GitHub Discussions
- **Bugs**: GitHub Issues
- **Security**: Email maintainers directly

---

## Best Practices

### 1. Privacy First

**Always** keep privacy in mind:
- Never log PII
- Never store IP addresses
- Validate all inputs
- Reject PII-containing events

### 2. Error Handling

```typescript
// Good ✓
try {
  await riskyOperation();
} catch (error) {
  logger.error({ error }, 'Operation failed');
  throw new Error('User-friendly message');
}

// Bad ✗
await riskyOperation(); // No error handling
```

### 3. Async/Await

```typescript
// Good ✓
async function fetchData() {
  const data = await getData();
  return processData(data);
}

// Bad ✗
function fetchData() {
  return getData().then(data => processData(data));
}
```

### 4. Type Safety

```typescript
// Good ✓
interface User {
  id: string;
  name: string;
}

function getUser(): User {
  return { id: '1', name: 'Alice' };
}

// Bad ✗
function getUser(): any {
  return { id: '1', name: 'Alice' };
}
```

### 5. Logging

```typescript
// Good ✓
logger.info({ userId, action }, 'User action performed');

// Bad ✗
console.log('User', userId, 'did', action);
```

---

## Resources

### Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Fastify Documentation](https://www.fastify.io/docs/)
- [Vitest Guide](https://vitest.dev/guide/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)

### Tools
- [VS Code](https://code.visualstudio.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [Postman](https://www.postman.com/) (API testing)
- [DBeaver](https://dbeaver.io/) (Database client)

### Community
- [GitHub Discussions](https://github.com/weather-mcp/analytics-server/discussions)
- [MCP Community](https://github.com/weather-mcp/mcp-server)

---

**Last Updated**: 2025-11-12
**Version**: 1.0.0
