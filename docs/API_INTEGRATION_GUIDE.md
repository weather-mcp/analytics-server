# Analytics API Integration Guide

This guide helps frontend developers integrate the Weather MCP Analytics API into the website project.

## Table of Contents

- [Base URL Configuration](#base-url-configuration)
- [CORS and Cross-Origin Requests](#cors-and-cross-origin-requests)
- [Rate Limiting](#rate-limiting)
- [Authentication](#authentication)
- [Response Format](#response-format)
- [TypeScript Types](#typescript-types)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)
- [Caching Strategy](#caching-strategy)
- [Testing](#testing)

---

## Base URL Configuration

###Production
```typescript
const API_BASE_URL = 'https://analytics.weather-mcp.dev';
```

### Development
```typescript
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://analytics.weather-mcp.dev'
  : 'http://localhost:3000';
```

---

## CORS and Cross-Origin Requests

The API is configured to accept requests from:
- `https://weather-mcp.dev` (production website)
- `https://analytics.weather-mcp.dev` (subdomain)
- `http://localhost:3000` (local development)
- `http://localhost:3001` (alternative local port)

### Allowed Methods
- `GET` - Retrieve statistics
- `POST` - Submit events (from MCP server only)
- `OPTIONS` - Preflight requests

### Allowed Headers
- `Content-Type: application/json`
- `Authorization` (reserved for future use)

**Note:** Credentials (cookies) are **not** supported - all requests are anonymous.

---

## Rate Limiting

- **Limit:** 60 requests per minute per IP address
- **Burst:** Up to 10 requests can be made immediately
- **Ban:** After 3 rate limit violations, IP is temporarily banned

### Rate Limit Headers

Every response includes rate limit information:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1699876543
```

### Handling Rate Limits

```typescript
async function fetchStats(endpoint: string) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    console.warn(`Rate limited. Retry after ${retryAfter}s`);
    throw new Error('Rate limit exceeded');
  }

  return response.json();
}
```

---

## Authentication

**Currently:** No authentication required
**Future:** Reserved for private analytics or admin endpoints

All endpoints are publicly accessible for read operations. Event submission (POST /v1/events) is intended for the MCP server only but is technically public.

---

## Response Format

All successful responses return JSON with consistent structure.

### Success Response (2xx)
```json
{
  "period": "7d",
  "summary": {
    "total_calls": 125000,
    "success_rate": 98.5
  }
}
```

### Error Response (4xx/5xx)
```json
{
  "error": "validation_failed",
  "message": "Invalid request parameters",
  "details": ["period must be one of: 7d, 30d, 90d, all"]
}
```

---

## TypeScript Types

The API provides TypeScript type definitions that can be imported into your project.

### Option 1: Copy Types from API Project

Copy `src/types/events.ts` from the analytics-server project to your website project:

```bash
cp analytics-server/src/types/events.ts website/src/types/analytics.ts
```

### Option 2: Define Types Inline

```typescript
// Stats API Response Types

export interface StatsOverview {
  period: string;
  start_date: string;
  end_date: string;
  summary: {
    total_calls: number;
    unique_versions: number;
    active_installs: number;
    success_rate: number;
    avg_response_time_ms: number;
  };
  tools: ToolStats[];
  errors: ErrorStats[];
  cache_hit_rate: number;
}

export interface ToolStats {
  name: string;
  calls: number;
  success_rate: number;
  avg_response_time_ms: number;
  p95_response_time_ms?: number;
}

export interface ErrorStats {
  type: string;
  count: number;
  percentage: number;
  last_seen?: string;
}
```

See `src/types/events.ts` in the analytics-server repository for complete type definitions.

---

## Usage Examples

### Fetch Overview Statistics

```typescript
async function getOverview(period: '7d' | '30d' | '90d' | 'all' = '7d'): Promise<StatsOverview> {
  const response = await fetch(`${API_BASE_URL}/v1/stats/overview?period=${period}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

// Usage
const stats = await getOverview('7d');
console.log(`Total calls: ${stats.summary.total_calls}`);
```

### Fetch Tool Statistics

```typescript
async function getToolsStats(period: '7d' | '30d' | '90d' | 'all' = '7d'): Promise<ToolStats[]> {
  const response = await fetch(`${API_BASE_URL}/v1/stats/tools?period=${period}&sort=calls`);

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

// Usage
const tools = await getToolsStats('7d');
const topTool = tools[0];
console.log(`Most popular tool: ${topTool.name} with ${topTool.calls} calls`);
```

### Fetch Specific Tool Details

```typescript
async function getToolDetails(toolName: string, period: string = '7d') {
  const response = await fetch(
    `${API_BASE_URL}/v1/stats/tool/${encodeURIComponent(toolName)}?period=${period}`
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Tool '${toolName}' not found`);
    }
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

// Usage
const forecastStats = await getToolDetails('get_forecast', '30d');
console.log(`Success rate: ${forecastStats.success_rate}%`);
```

### React Hook Example (with SWR)

```typescript
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useAnalyticsOverview(period: string = '7d') {
  const { data, error, isLoading } = useSWR<StatsOverview>(
    `${API_BASE_URL}/v1/stats/overview?period=${period}`,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: false,
    }
  );

  return {
    stats: data,
    isLoading,
    isError: error,
  };
}

// Usage in component
function Dashboard() {
  const { stats, isLoading, isError } = useAnalyticsOverview('7d');

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Failed to load stats</div>;

  return (
    <div>
      <h1>Total Calls: {stats.summary.total_calls}</h1>
      <p>Success Rate: {stats.summary.success_rate}%</p>
    </div>
  );
}
```

---

## Error Handling

### Common Error Responses

| Status Code | Error Code | Meaning |
|-------------|-----------|---------|
| 400 | `validation_failed` | Invalid query parameters |
| 404 | `not_found` | Resource not found (e.g., invalid tool name) |
| 429 | `rate_limit_exceeded` | Too many requests |
| 500 | `internal_error` | Server error |
| 503 | `service_unavailable` | Service temporarily down |

### Recommended Error Handling

```typescript
async function fetchWithErrorHandling(endpoint: string) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);

    if (!response.ok) {
      const errorData = await response.json();

      switch (response.status) {
        case 429:
          // Rate limited - show retry message
          throw new Error(`Rate limited. Try again in ${errorData.retry_after}s`);
        case 404:
          // Not found - show friendly message
          throw new Error('Data not found');
        case 500:
        case 503:
          // Server error - show generic error
          throw new Error('Service temporarily unavailable');
        default:
          throw new Error(errorData.message || 'Unknown error');
      }
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      // Network error (CORS, DNS, etc.)
      throw new Error('Network error. Please check your connection.');
    }
    throw error;
  }
}
```

---

## Caching Strategy

### API-Level Caching

The API implements server-side caching with:
- **TTL:** 5 minutes (300 seconds)
- **Cache Key:** Endpoint + query parameters
- **Storage:** Redis
- **Hit Rate Target:** >80%

Responses are cached automatically - no special headers required.

### Client-Side Caching Recommendations

1. **SWR (Recommended for React)**
   - Use `stale-while-revalidate` strategy
   - Set `refreshInterval` to 30-60 seconds
   - Enable `revalidateOnFocus: false` to reduce requests

2. **React Query**
   ```typescript
   const { data } = useQuery({
     queryKey: ['stats', 'overview', period],
     queryFn: () => fetchOverview(period),
     staleTime: 30000, // 30 seconds
     cacheTime: 300000, // 5 minutes
   });
   ```

3. **Manual Caching**
   ```typescript
   const cache = new Map();
   const CACHE_TTL = 30000; // 30 seconds

   async function fetchWithCache(endpoint: string) {
     const cached = cache.get(endpoint);
     if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
       return cached.data;
     }

     const data = await fetch(`${API_BASE_URL}${endpoint}`).then(r => r.json());
     cache.set(endpoint, { data, timestamp: Date.now() });
     return data;
   }
   ```

---

## Testing

### Test Against Development Server

```bash
# Start analytics API locally
cd analytics-server
docker-compose up -d  # Start PostgreSQL and Redis
npm run dev           # Start API on port 3000
```

```typescript
// In website project - use local API
const API_BASE_URL = 'http://localhost:3000';
```

### Mock API Responses for Testing

```typescript
// __mocks__/analytics-api.ts
export const mockStatsOverview: StatsOverview = {
  period: '7d',
  start_date: '2025-11-06',
  end_date: '2025-11-13',
  summary: {
    total_calls: 125000,
    unique_versions: 3,
    active_installs: 42,
    success_rate: 98.5,
    avg_response_time_ms: 245,
  },
  tools: [
    {
      name: 'get_forecast',
      calls: 45000,
      success_rate: 99.2,
      avg_response_time_ms: 220,
      p95_response_time_ms: 450,
    },
  ],
  errors: [],
  cache_hit_rate: 75.3,
};

// Usage in tests
jest.mock('../lib/analytics-api');
import { getOverview } from '../lib/analytics-api';
(getOverview as jest.Mock).mockResolvedValue(mockStatsOverview);
```

### Integration Tests with Real API

```typescript
describe('Analytics API Integration', () => {
  it('should fetch overview statistics', async () => {
    const stats = await getOverview('7d');

    expect(stats).toHaveProperty('summary');
    expect(stats.summary.total_calls).toBeGreaterThanOrEqual(0);
    expect(stats.summary.success_rate).toBeGreaterThanOrEqual(0);
    expect(stats.summary.success_rate).toBeLessThanOrEqual(100);
  });
});
```

---

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

1. **Check the origin:** Ensure your website is running on an allowed origin
2. **Check environment:** Production API may not allow localhost
3. **Check headers:** Verify `Content-Type: application/json` is set

### Rate Limiting

If you're hitting rate limits:

1. **Reduce request frequency:** Increase SWR `refreshInterval`
2. **Batch requests:** Fetch all needed data in one request
3. **Cache client-side:** Use longer `staleTime` values

### Empty Data

If API returns empty arrays or zero values:

1. **Check time period:** Try `period=all` to see if any data exists
2. **Check database:** Ensure events have been submitted
3. **Check date range:** Older data may have been purged (90-day retention)

---

## Support

For issues or questions:
- **GitHub Issues:** https://github.com/weather-mcp/analytics-server/issues
- **Documentation:** https://github.com/weather-mcp/analytics-server/tree/main/docs
- **OpenAPI Spec:** See `docs/openapi.yaml` for full API specification

---

## Changelog

### 2025-11-13
- Initial API Integration Guide
- Added TypeScript types documentation
- Added React/SWR examples
- Added error handling best practices
- Added caching recommendations
