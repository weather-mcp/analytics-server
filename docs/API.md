# Analytics Server API Documentation

**Version:** 1.0.0
**Base URL:** `https://analytics.weather-mcp.dev/v1` (production) or `http://localhost:3000/v1` (development)
**Last Updated:** 2025-01-13

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Event Ingestion API](#event-ingestion-api)
5. [Statistics API](#statistics-api)
6. [Health & Status API](#health--status-api)
7. [Error Handling](#error-handling)
8. [Data Models](#data-models)
9. [Examples](#examples)

---

## Overview

The Weather MCP Analytics Server provides a REST API for:
- **Collecting** anonymous analytics events from MCP server instances
- **Aggregating** usage statistics and performance metrics
- **Serving** public statistics for the analytics dashboard

All APIs follow REST principles, accept and return JSON, and use standard HTTP status codes.

### API Characteristics

- **Privacy-First**: No PII collection, no IP logging
- **High Performance**: p95 response time < 50ms (with caching)
- **Reliable**: 99.9% uptime target
- **Rate Limited**: 60 requests/minute per IP address
- **CORS Enabled**: Configured for website integration

---

## Authentication

**No authentication is required** for any endpoint. All APIs are publicly accessible.

**Security is enforced through:**
- Rate limiting (60 req/min per IP)
- Input validation (strict schema validation)
- PII detection and rejection
- Request size limits (100KB maximum)

---

## Rate Limiting

### Limits

- **60 requests per minute** per IP address
- **Burst allowance**: Up to 10 requests in rapid succession
- **Ban after 3 violations**: Temporary ban after exceeding limits 3 times

### Rate Limit Headers

All responses include rate limit information:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1673550300
```

### Rate Limit Exceeded Response

**HTTP 429 Too Many Requests**

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 30 seconds.",
  "statusCode": 429
}
```

---

## Event Ingestion API

### POST /v1/events

Submit one or more analytics events for processing.

#### Request

**Method:** `POST`
**Content-Type:** `application/json`
**Body:** Array of event objects

```json
{
  "events": [
    {
      "version": "1.6.1",
      "tool": "get_forecast",
      "status": "success",
      "timestamp_hour": "2025-01-13T10:00:00Z",
      "analytics_level": "standard",
      "response_time_ms": 145,
      "service": "noaa",
      "cache_hit": true,
      "country": "US"
    }
  ]
}
```

#### Event Schema

##### Minimal Event (analytics_level: "minimal")

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | MCP server version (e.g., "1.6.1") |
| `tool` | string | Yes | Tool name (e.g., "get_forecast") |
| `status` | string | Yes | "success" or "error" |
| `timestamp_hour` | string | Yes | ISO 8601 timestamp (rounded to hour) |
| `analytics_level` | string | Yes | Must be "minimal" |

##### Standard Event (analytics_level: "standard")

All minimal fields plus:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `response_time_ms` | number | No | Response time in milliseconds |
| `service` | string | No | Service used (e.g., "noaa", "openmeteo") |
| `cache_hit` | boolean | No | Whether response was cached |
| `country` | string | No | Country code (ISO 3166-1 alpha-2) |

##### Detailed Event (analytics_level: "detailed")

All standard fields plus:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `error_type` | string | No* | Error type if status is "error" |
| `parameters` | object | No | Anonymous tool parameters (NO coordinates/locations) |

*Required when `status` is "error"

#### Valid Enum Values

**Tools:**
- `get_forecast` - Weather forecast
- `get_current_conditions` - Current weather conditions
- `get_alerts` - Weather alerts
- `get_historical_weather` - Historical weather data
- `get_air_quality` - Air quality information
- `get_marine_conditions` - Marine and coastal conditions
- `get_river_conditions` - River level and flow information
- `get_wildfire_info` - Wildfire information
- `get_sun_times` - Sunrise/sunset times
- `get_moon_phase` - Moon phase information
- `get_radar_map_url` - Weather radar map
- `get_station_info` - Weather station information

**Services:**
- `noaa` - NOAA Weather Service
- `openmeteo` - Open-Meteo
- `nifc` - National Interagency Fire Center
- `usgs` - US Geological Survey

**Error Types:**
- `network_error` - Network/connectivity error
- `api_error` - External API error
- `validation_error` - Input validation error
- `rate_limit_error` - Rate limit exceeded
- `timeout_error` - Request timeout
- `unknown_error` - Unknown/unclassified error

#### Response

**HTTP 200 OK**

```json
{
  "success": true,
  "message": "Events received successfully",
  "count": 1
}
```

#### Error Responses

**HTTP 400 Bad Request** - Validation error

```json
{
  "error": "Validation Error",
  "message": "Invalid event data",
  "details": [
    {
      "field": "tool",
      "issue": "Invalid tool name: 'invalid_tool'"
    }
  ],
  "statusCode": 400
}
```

**HTTP 400 Bad Request** - PII detected

```json
{
  "error": "PII Detected",
  "message": "Events contain personally identifiable information (PII) and have been rejected",
  "rejectedFields": ["coordinates", "location"],
  "statusCode": 400
}
```

**HTTP 503 Service Unavailable** - Queue full

```json
{
  "error": "Service Unavailable",
  "message": "Event queue is full. Please try again later.",
  "statusCode": 503
}
```

#### Validation Rules

- **Max batch size**: 100 events per request
- **Max request size**: 100KB
- **PII detection**: Automatic rejection of events containing:
  - `coordinates`, `latitude`, `longitude`, `lat`, `lon`
  - `location`, `address`, `city`, `zipcode`, `postal_code`
  - `name`, `email`, `phone`, `ip`, `user_id`
- **Timestamp rounding**: `timestamp_hour` must be rounded to the nearest hour
- **Error type requirement**: `error_type` is required when `status` is "error"

---

## Statistics API

All statistics endpoints support filtering by time period and caching (5-minute TTL).

### Common Query Parameters

| Parameter | Type | Values | Default | Description |
|-----------|------|--------|---------|-------------|
| `period` | string | `7d`, `30d`, `90d` | `30d` | Time period for statistics |

### GET /v1/stats/overview

Get summary statistics across all tools.

#### Response

**HTTP 200 OK**

```json
{
  "period": "30d",
  "summary": {
    "total_requests": 125430,
    "successful_requests": 123876,
    "failed_requests": 1554,
    "success_rate": 98.76,
    "unique_tools": 12,
    "unique_countries": 45,
    "avg_response_time_ms": 147,
    "cache_hit_rate": 78.5
  },
  "by_analytics_level": {
    "minimal": 45230,
    "standard": 67890,
    "detailed": 12310
  },
  "top_tools": [
    {
      "tool": "get_forecast",
      "count": 56780,
      "percentage": 45.3
    },
    {
      "tool": "get_current_conditions",
      "count": 34560,
      "percentage": 27.6
    }
  ],
  "generated_at": "2025-01-13T10:00:00Z"
}
```

### GET /v1/stats/tools

Get statistics for all tools.

#### Query Parameters

| Parameter | Type | Values | Default | Description |
|-----------|------|--------|---------|-------------|
| `period` | string | `7d`, `30d`, `90d` | `30d` | Time period |
| `sort` | string | `usage`, `success_rate`, `response_time` | `usage` | Sort order |

#### Response

**HTTP 200 OK**

```json
{
  "period": "30d",
  "tools": [
    {
      "tool": "get_forecast",
      "total_requests": 56780,
      "successful_requests": 56234,
      "failed_requests": 546,
      "success_rate": 99.04,
      "avg_response_time_ms": 145,
      "p50_response_time_ms": 120,
      "p95_response_time_ms": 280,
      "p99_response_time_ms": 450,
      "cache_hit_rate": 82.3,
      "top_services": [
        {"service": "noaa", "count": 45230, "percentage": 79.7},
        {"service": "openmeteo", "count": 11550, "percentage": 20.3}
      ]
    }
  ],
  "generated_at": "2025-01-13T10:00:00Z"
}
```

### GET /v1/stats/tool/:toolName

Get detailed statistics for a specific tool.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `toolName` | string | Tool name (e.g., "get_forecast") |

#### Query Parameters

| Parameter | Type | Values | Default | Description |
|-----------|------|--------|---------|-------------|
| `period` | string | `7d`, `30d`, `90d` | `30d` | Time period |

#### Response

**HTTP 200 OK**

```json
{
  "tool": "get_forecast",
  "period": "30d",
  "statistics": {
    "total_requests": 56780,
    "successful_requests": 56234,
    "failed_requests": 546,
    "success_rate": 99.04,
    "avg_response_time_ms": 145,
    "p50_response_time_ms": 120,
    "p95_response_time_ms": 280,
    "p99_response_time_ms": 450,
    "cache_hit_rate": 82.3
  },
  "by_service": [
    {
      "service": "noaa",
      "count": 45230,
      "success_rate": 99.2,
      "avg_response_time_ms": 132
    },
    {
      "service": "openmeteo",
      "count": 11550,
      "success_rate": 98.5,
      "avg_response_time_ms": 187
    }
  ],
  "by_country": [
    {"country": "US", "count": 34560, "percentage": 60.9},
    {"country": "GB", "count": 8930, "percentage": 15.7},
    {"country": "CA", "count": 5670, "percentage": 10.0}
  ],
  "daily_trend": [
    {"date": "2025-01-01", "count": 1890, "success_rate": 99.1},
    {"date": "2025-01-02", "count": 2120, "success_rate": 98.9}
  ],
  "generated_at": "2025-01-13T10:00:00Z"
}
```

**HTTP 404 Not Found** - Unknown tool

```json
{
  "error": "Not Found",
  "message": "Tool 'unknown_tool' not found",
  "statusCode": 404
}
```

### GET /v1/stats/errors

Get error statistics and trends.

#### Query Parameters

| Parameter | Type | Values | Default | Description |
|-----------|------|--------|---------|-------------|
| `period` | string | `7d`, `30d`, `90d` | `30d` | Time period |

#### Response

**HTTP 200 OK**

```json
{
  "period": "30d",
  "summary": {
    "total_errors": 1554,
    "error_rate": 1.24,
    "unique_error_types": 5,
    "affected_tools": 8
  },
  "by_error_type": [
    {
      "error_type": "network_error",
      "count": 892,
      "percentage": 57.4,
      "affected_tools": ["get_forecast", "get_current_conditions", "get_alerts"],
      "first_seen": "2024-12-15T08:23:00Z",
      "last_seen": "2025-01-13T09:45:00Z"
    },
    {
      "error_type": "api_error",
      "count": 445,
      "percentage": 28.6,
      "affected_tools": ["get_forecast", "get_air_quality"],
      "first_seen": "2024-12-20T14:10:00Z",
      "last_seen": "2025-01-13T09:12:00Z"
    }
  ],
  "by_tool": [
    {
      "tool": "get_forecast",
      "error_count": 546,
      "total_requests": 56780,
      "error_rate": 0.96
    }
  ],
  "daily_trend": [
    {"date": "2025-01-01", "error_count": 45, "error_rate": 2.38},
    {"date": "2025-01-02", "error_count": 38, "error_rate": 1.79}
  ],
  "generated_at": "2025-01-13T10:00:00Z"
}
```

### GET /v1/stats/performance

Get performance metrics across all tools.

#### Query Parameters

| Parameter | Type | Values | Default | Description |
|-----------|------|--------|---------|-------------|
| `period` | string | `7d`, `30d`, `90d` | `30d` | Time period |

#### Response

**HTTP 200 OK**

```json
{
  "period": "30d",
  "overall": {
    "avg_response_time_ms": 147,
    "p50_response_time_ms": 125,
    "p95_response_time_ms": 320,
    "p99_response_time_ms": 580,
    "cache_hit_rate": 78.5
  },
  "by_tool": [
    {
      "tool": "get_forecast",
      "avg_response_time_ms": 145,
      "p50_response_time_ms": 120,
      "p95_response_time_ms": 280,
      "p99_response_time_ms": 450,
      "cache_hit_rate": 82.3
    }
  ],
  "by_service": [
    {
      "service": "noaa",
      "avg_response_time_ms": 132,
      "request_count": 78450,
      "cache_hit_rate": 81.2
    },
    {
      "service": "openmeteo",
      "avg_response_time_ms": 187,
      "request_count": 34560,
      "cache_hit_rate": 72.5
    }
  ],
  "cache_effectiveness": {
    "total_requests": 125430,
    "cache_hits": 98462,
    "cache_misses": 26968,
    "hit_rate": 78.5,
    "avg_cached_response_ms": 45,
    "avg_uncached_response_ms": 320
  },
  "generated_at": "2025-01-13T10:00:00Z"
}
```

---

## Health & Status API

### GET /v1/health

Basic health check endpoint.

#### Response

**HTTP 200 OK** - Service is healthy

```json
{
  "status": "healthy",
  "timestamp": "2025-01-13T10:00:00Z"
}
```

**HTTP 503 Service Unavailable** - Service is unhealthy

```json
{
  "status": "unhealthy",
  "reason": "Database connection failed",
  "timestamp": "2025-01-13T10:00:00Z"
}
```

### GET /v1/status

Detailed system status with component health.

#### Response

**HTTP 200 OK**

```json
{
  "status": "healthy",
  "uptime_seconds": 3456789,
  "timestamp": "2025-01-13T10:00:00Z",
  "components": {
    "database": {
      "status": "healthy",
      "response_time_ms": 5
    },
    "redis": {
      "status": "healthy",
      "response_time_ms": 2
    },
    "queue": {
      "status": "healthy",
      "depth": 45,
      "max_size": 10000
    }
  },
  "metrics": {
    "events_processed_24h": 8920,
    "last_event_received": "2025-01-13T09:58:34Z",
    "queue_depth": 45
  }
}
```

---

## Error Handling

### Error Response Format

All error responses follow this structure:

```json
{
  "error": "Error Title",
  "message": "Detailed error message",
  "statusCode": 400,
  "details": [] // Optional: Additional error details
}
```

### HTTP Status Codes

| Status Code | Meaning | When Used |
|-------------|---------|-----------|
| 200 OK | Success | Successful request |
| 400 Bad Request | Client error | Invalid request, validation failure, PII detected |
| 404 Not Found | Not found | Unknown tool or endpoint |
| 429 Too Many Requests | Rate limited | Rate limit exceeded |
| 500 Internal Server Error | Server error | Unexpected server error |
| 503 Service Unavailable | Service unavailable | Queue full, database down |

---

## Data Models

### Event Model

```typescript
interface AnalyticsEvent {
  // Required fields (all levels)
  version: string;              // MCP server version
  tool: string;                 // Tool name
  status: 'success' | 'error';  // Request status
  timestamp_hour: string;       // ISO 8601, rounded to hour
  analytics_level: 'minimal' | 'standard' | 'detailed';

  // Optional fields (standard and detailed)
  response_time_ms?: number;    // Response time
  service?: string;             // Service used
  cache_hit?: boolean;          // Cache hit/miss
  country?: string;             // Country code (ISO 3166-1 alpha-2)

  // Optional fields (detailed only)
  error_type?: string;          // Error type (required if status is 'error')
  parameters?: Record<string, any>; // Anonymous parameters (NO PII)
}
```

### Statistics Response Models

See the individual endpoint documentation above for complete response schemas.

---

## Examples

### Submit Minimal Analytics Event

```bash
curl -X POST https://analytics.weather-mcp.dev/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "version": "1.6.1",
      "tool": "get_forecast",
      "status": "success",
      "timestamp_hour": "2025-01-13T10:00:00Z",
      "analytics_level": "minimal"
    }]
  }'
```

### Submit Standard Analytics Event

```bash
curl -X POST https://analytics.weather-mcp.dev/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "version": "1.6.1",
      "tool": "get_forecast",
      "status": "success",
      "timestamp_hour": "2025-01-13T10:00:00Z",
      "analytics_level": "standard",
      "response_time_ms": 145,
      "service": "noaa",
      "cache_hit": true,
      "country": "US"
    }]
  }'
```

### Submit Multiple Events in Batch

```bash
curl -X POST https://analytics.weather-mcp.dev/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "version": "1.6.1",
        "tool": "get_forecast",
        "status": "success",
        "timestamp_hour": "2025-01-13T10:00:00Z",
        "analytics_level": "standard",
        "response_time_ms": 145,
        "service": "noaa",
        "cache_hit": true,
        "country": "US"
      },
      {
        "version": "1.6.1",
        "tool": "get_current_conditions",
        "status": "success",
        "timestamp_hour": "2025-01-13T10:00:00Z",
        "analytics_level": "standard",
        "response_time_ms": 98,
        "service": "openmeteo",
        "cache_hit": false,
        "country": "GB"
      }
    ]
  }'
```

### Submit Error Event

```bash
curl -X POST https://analytics.weather-mcp.dev/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "version": "1.6.1",
      "tool": "get_forecast",
      "status": "error",
      "timestamp_hour": "2025-01-13T10:00:00Z",
      "analytics_level": "detailed",
      "error_type": "network_error",
      "service": "noaa",
      "country": "US"
    }]
  }'
```

### Get Overview Statistics

```bash
# Get 30-day overview
curl https://analytics.weather-mcp.dev/v1/stats/overview

# Get 7-day overview
curl https://analytics.weather-mcp.dev/v1/stats/overview?period=7d
```

### Get Tool Statistics

```bash
# Get all tools (sorted by usage)
curl https://analytics.weather-mcp.dev/v1/stats/tools

# Get all tools sorted by success rate
curl https://analytics.weather-mcp.dev/v1/stats/tools?sort=success_rate

# Get specific tool statistics
curl https://analytics.weather-mcp.dev/v1/stats/tool/get_forecast?period=30d
```

### Get Error Statistics

```bash
curl https://analytics.weather-mcp.dev/v1/stats/errors?period=30d
```

### Get Performance Metrics

```bash
curl https://analytics.weather-mcp.dev/v1/stats/performance?period=7d
```

### Check System Health

```bash
# Basic health check
curl https://analytics.weather-mcp.dev/v1/health

# Detailed status
curl https://analytics.weather-mcp.dev/v1/status
```

---

## Integration Libraries

### TypeScript/JavaScript

Use the built-in Fetch API or axios:

```typescript
interface AnalyticsEvent {
  version: string;
  tool: string;
  status: 'success' | 'error';
  timestamp_hour: string;
  analytics_level: 'minimal' | 'standard' | 'detailed';
  response_time_ms?: number;
  service?: string;
  cache_hit?: boolean;
  country?: string;
  error_type?: string;
}

async function submitAnalytics(events: AnalyticsEvent[]) {
  const response = await fetch('https://analytics.weather-mcp.dev/v1/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ events }),
  });

  if (!response.ok) {
    throw new Error(`Analytics submission failed: ${response.statusText}`);
  }

  return response.json();
}
```

### Python

```python
import requests
from datetime import datetime

def submit_analytics(events):
    response = requests.post(
        'https://analytics.weather-mcp.dev/v1/events',
        json={'events': events},
        headers={'Content-Type': 'application/json'}
    )
    response.raise_for_status()
    return response.json()

# Example event
event = {
    'version': '1.6.1',
    'tool': 'get_forecast',
    'status': 'success',
    'timestamp_hour': datetime.now().replace(minute=0, second=0, microsecond=0).isoformat() + 'Z',
    'analytics_level': 'standard',
    'response_time_ms': 145,
    'service': 'noaa',
    'cache_hit': True,
    'country': 'US'
}

submit_analytics([event])
```

---

## Support

For API questions and issues:
- **GitHub Issues**: https://github.com/weather-mcp/analytics-server/issues
- **API Integration Guide**: [API_INTEGRATION_GUIDE.md](API_INTEGRATION_GUIDE.md)
- **OpenAPI Specification**: [openapi.yaml](openapi.yaml)

---

**API Documentation Version:** 1.0.0
**Last Updated:** 2025-01-13
**Maintained by:** Weather MCP Team
