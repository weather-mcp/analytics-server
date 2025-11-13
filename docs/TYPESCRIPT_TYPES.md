# TypeScript Types for Analytics API

This document describes the TypeScript types available for the Analytics API and how to use them in your project.

## Source File

All types are defined in: **`src/types/events.ts`**

## Using Types in Your Project

### Option 1: Copy Type Definitions (Recommended)

Copy the type definitions file to your project:

```bash
# From the analytics-server directory
cp src/types/events.ts ../website/src/types/analytics.ts
```

Then import in your code:

```typescript
import { StatsOverview, ToolStats, ErrorStats } from '@/types/analytics';
```

### Option 2: Reference via Path (Monorepo Only)

If both projects are in a monorepo, you can reference types directly:

```typescript
import type { StatsOverview } from '../../../analytics-server/src/types/events';
```

### Option 3: Shared Types Package (Future)

In the future, we may publish types as an npm package:

```bash
npm install @weather-mcp/analytics-types
```

```typescript
import type { StatsOverview } from '@weather-mcp/analytics-types';
```

---

## Available Types

### Event Types (for MCP Server)

These types define the events sent by the MCP server to the API.

#### `MinimalEvent`

Minimal analytics event (no performance data):

```typescript
interface MinimalEvent {
  version: string;                 // MCP server version (e.g., "1.6.1")
  tool: string;                    // Tool name (e.g., "get_forecast")
  status: 'success' | 'error';     // Event outcome
  timestamp_hour: string;          // ISO 8601 datetime rounded to hour
  analytics_level: 'minimal';
}
```

**Example:**
```typescript
const event: MinimalEvent = {
  version: "1.6.1",
  tool: "get_forecast",
  status: "success",
  timestamp_hour: "2025-11-13T14:00:00Z",
  analytics_level: "minimal",
};
```

#### `StandardEvent`

Standard event with performance metrics:

```typescript
interface StandardEvent extends MinimalEvent {
  analytics_level: 'standard';
  response_time_ms?: number;       // 0-120000
  service?: 'noaa' | 'openmeteo';  // Data provider
  cache_hit?: boolean;             // Was response cached?
  retry_count?: number;            // 0-10
  country?: string;                // ISO 3166-1 alpha-2 (e.g., "US")
  error_type?: string;             // Error classification (if status="error")
}
```

#### `DetailedEvent`

Detailed event with session tracking:

```typescript
interface DetailedEvent extends StandardEvent {
  analytics_level: 'detailed';
  parameters?: Record<string, unknown>;  // Anonymized parameters
  session_id?: string;                   // Hashed session ID (16 chars)
  sequence_number?: number;              // Event sequence in session
}
```

#### `AnalyticsEvent`

Union type for all event types:

```typescript
type AnalyticsEvent = MinimalEvent | StandardEvent | DetailedEvent;
```

---

### API Request/Response Types

#### `EventBatchRequest`

Request format for submitting events:

```typescript
interface EventBatchRequest {
  events: AnalyticsEvent[];  // 1-100 events
}
```

**Example:**
```typescript
const request: EventBatchRequest = {
  events: [
    {
      version: "1.6.1",
      tool: "get_forecast",
      status: "success",
      timestamp_hour: "2025-11-13T14:00:00Z",
      analytics_level: "minimal",
    },
  ],
};
```

#### `EventBatchResponse`

Response after submitting events:

```typescript
interface EventBatchResponse {
  status: 'accepted';
  count: number;         // Number of events accepted
  timestamp: string;     // ISO 8601 datetime
}
```

#### `ErrorResponse`

Error response format:

```typescript
interface ErrorResponse {
  error: string;                   // Error code
  message?: string;                // Human-readable message (optional)
  details?: string | string[];     // Detailed error info
  retry_after?: number;            // Seconds to wait (rate limiting)
}
```

**Example:**
```typescript
const error: ErrorResponse = {
  error: "rate_limit_exceeded",
  message: "Too many requests, please try again later",
  retry_after: 60,
};
```

---

### Stats API Types (for Website/Dashboard)

These types define the responses from the stats endpoints.

#### `StatsOverview`

Overview statistics for a time period:

```typescript
interface StatsOverview {
  period: string;              // e.g., "7d", "30d", "90d", "all"
  start_date: string;          // ISO 8601 date
  end_date: string;            // ISO 8601 date
  summary: {
    total_calls: number;
    unique_versions: number;
    active_installs: number;   // Estimated
    success_rate: number;      // Percentage
    avg_response_time_ms: number;
  };
  tools: ToolStats[];
  errors: ErrorStats[];
  cache_hit_rate: number;      // Percentage
}
```

**Usage Example:**
```typescript
async function fetchOverview(period: string): Promise<StatsOverview> {
  const response = await fetch(`/v1/stats/overview?period=${period}`);
  return response.json();
}

const stats = await fetchOverview('7d');
console.log(`Total calls: ${stats.summary.total_calls}`);
console.log(`Success rate: ${stats.summary.success_rate}%`);
```

#### `ToolStats`

Statistics for a specific tool:

```typescript
interface ToolStats {
  name: string;                   // Tool name
  calls: number;                  // Total calls
  success_rate: number;           // Percentage
  avg_response_time_ms: number;
  p95_response_time_ms?: number;  // 95th percentile
}
```

**Usage Example:**
```typescript
const tools: ToolStats[] = await fetchToolsStats('7d');
const mostPopular = tools.sort((a, b) => b.calls - a.calls)[0];
console.log(`Most used: ${mostPopular.name} (${mostPopular.calls} calls)`);
```

#### `ErrorStats`

Error statistics:

```typescript
interface ErrorStats {
  type: string;          // Error type
  count: number;         // Occurrences
  percentage: number;    // Percentage of total errors
  last_seen?: string;    // ISO 8601 datetime
}
```

---

### Database Types (Internal)

These types represent database records. Website developers typically don't need these, but they're available if needed.

#### `EventRecord`

Database event record (includes auto-generated fields):

```typescript
interface EventRecord {
  id: number;
  timestamp: Date;
  timestamp_hour: Date;
  version: string;
  tool: string;
  status: 'success' | 'error';
  analytics_level: 'minimal' | 'standard' | 'detailed';
  response_time_ms?: number | null;
  service?: 'noaa' | 'openmeteo' | null;
  cache_hit?: boolean | null;
  retry_count?: number | null;
  country?: string | null;
  parameters?: Record<string, unknown> | null;
  session_id?: string | null;
  sequence_number?: number | null;
  error_type?: string | null;
  created_at: Date;
}
```

#### `DailyAggregation`, `HourlyAggregation`, `ErrorSummary`

See `src/types/events.ts` for complete definitions of aggregation types.

---

## Type Guards

### Type Narrowing for Events

Use type guards to narrow event types:

```typescript
function isStandardEvent(event: AnalyticsEvent): event is StandardEvent {
  return event.analytics_level === 'standard';
}

function isDetailedEvent(event: AnalyticsEvent): event is DetailedEvent {
  return event.analytics_level === 'detailed';
}

// Usage
if (isStandardEvent(event)) {
  // TypeScript knows event has response_time_ms, service, etc.
  console.log(`Response time: ${event.response_time_ms}ms`);
}
```

### Validation with Zod

For runtime validation, use the Zod schemas from `src/api/validation.ts`:

```typescript
import { EventSchema } from './validation';

const result = EventSchema.safeParse(unknownData);
if (result.success) {
  const event: AnalyticsEvent = result.data;
  // Type-safe event
}
```

---

## React/TypeScript Examples

### Typed useState

```typescript
import { useState } from 'react';
import type { StatsOverview } from '@/types/analytics';

function Dashboard() {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview('7d').then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!stats) return <div>No data</div>;

  return <div>Total Calls: {stats.summary.total_calls}</div>;
}
```

### Typed API Client

```typescript
import type { StatsOverview, ToolStats, ErrorStats } from '@/types/analytics';

class AnalyticsClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getOverview(period: '7d' | '30d' | '90d' | 'all'): Promise<StatsOverview> {
    const response = await fetch(`${this.baseUrl}/v1/stats/overview?period=${period}`);
    if (!response.ok) throw new Error('Failed to fetch overview');
    return response.json();
  }

  async getToolsStats(period: string): Promise<ToolStats[]> {
    const response = await fetch(`${this.baseUrl}/v1/stats/tools?period=${period}`);
    if (!response.ok) throw new Error('Failed to fetch tools stats');
    return response.json();
  }

  async getErrorStats(period: string): Promise<ErrorStats[]> {
    const response = await fetch(`${this.baseUrl}/v1/stats/errors?period=${period}`);
    if (!response.ok) throw new Error('Failed to fetch error stats');
    return response.json();
  }
}

// Usage
const client = new AnalyticsClient('https://analytics.weather-mcp.dev');
const overview = await client.getOverview('7d');
```

### Typed React Hook (SWR)

```typescript
import useSWR from 'swr';
import type { StatsOverview } from '@/types/analytics';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useAnalytics(period: string = '7d') {
  const { data, error, isLoading } = useSWR<StatsOverview>(
    `/v1/stats/overview?period=${period}`,
    fetcher
  );

  return {
    overview: data,
    isLoading,
    isError: !!error,
  };
}

// Fully typed usage
function StatsCard() {
  const { overview, isLoading, isError } = useAnalytics('7d');

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error loading stats</div>;
  if (!overview) return null;

  // TypeScript knows overview.summary.total_calls is a number
  return <div>{overview.summary.total_calls} calls</div>;
}
```

---

## Enums and Constants

### Tool Names

```typescript
const VALID_TOOLS = [
  'get_forecast',
  'get_current_conditions',
  'get_alerts',
  'get_historical_weather',
  'check_service_status',
  'search_location',
  'get_air_quality',
  'get_marine_conditions',
  'get_weather_imagery',
  'get_lightning_activity',
  'get_river_conditions',
  'get_wildfire_info',
] as const;

type ToolName = typeof VALID_TOOLS[number];
```

### Service Types

```typescript
const VALID_SERVICES = ['noaa', 'openmeteo'] as const;
type ServiceType = typeof VALID_SERVICES[number];
```

### Period Options

```typescript
type Period = '7d' | '30d' | '90d' | 'all';
```

---

## Best Practices

### 1. Always Type API Responses

```typescript
// ❌ Bad: Untyped
const data = await fetch('/v1/stats/overview').then(r => r.json());

// ✅ Good: Typed
const data: StatsOverview = await fetch('/v1/stats/overview').then(r => r.json());
```

### 2. Use Type Guards for Union Types

```typescript
// ❌ Bad: Type assertions
const event = data as StandardEvent;

// ✅ Good: Type guards
if (isStandardEvent(event)) {
  // TypeScript infers correct type
}
```

### 3. Prefer Interfaces for Extensibility

```typescript
// ✅ Good: Interfaces can be extended
interface CustomStats extends ToolStats {
  customField: string;
}
```

### 4. Use Readonly for Immutable Data

```typescript
interface ImmutableStats extends Readonly<StatsOverview> {
  // All properties are readonly
}
```

---

## Troubleshooting

### "Property does not exist" Errors

**Problem:** TypeScript complains that a property doesn't exist
**Solution:** Ensure you're using the correct type and the API response matches

```typescript
// Check the API response structure
const response = await fetch('/v1/stats/overview');
const data = await response.json();
console.log(data); // Inspect actual structure

// Then verify type matches
const stats: StatsOverview = data;
```

### Type Import Errors

**Problem:** Can't import types from analytics-server
**Solution:** Copy the types file to your project or adjust import paths

```bash
# Copy types
cp ../analytics-server/src/types/events.ts ./src/types/analytics.ts

# Then import
import type { StatsOverview } from '@/types/analytics';
```

---

## Full Type Reference

For the complete, up-to-date type definitions, always refer to:

**`analytics-server/src/types/events.ts`**

This is the single source of truth for all Analytics API types.

---

## Support

For type-related issues:
- Check `src/types/events.ts` for latest definitions
- See OpenAPI spec at `docs/openapi.yaml`
- Report issues at https://github.com/weather-mcp/analytics-server/issues
