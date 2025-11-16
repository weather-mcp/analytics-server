# API Reference

Complete reference for the Weather MCP Analytics Server API.

**Base URL**: `http://localhost:3000` (development) or `https://analytics.weather-mcp.dev` (production)

**Version**: v1

---

## Table of Contents

- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Event Ingestion](#event-ingestion)
- [Statistics Endpoints](#statistics-endpoints)
- [System Endpoints](#system-endpoints)
- [Error Responses](#error-responses)

---

## Authentication

The Analytics API is **public and does not require authentication**. This is intentional to ensure truly anonymous data collection.

## Rate Limiting

All endpoints are rate limited to prevent abuse:

- **Rate**: 60 requests per minute per IP
- **Burst**: 10 additional requests allowed
- **Headers**: Rate limit info included in response headers
  - `x-ratelimit-limit`: Maximum requests allowed
  - `x-ratelimit-remaining`: Requests remaining
  - `x-ratelimit-reset`: Unix timestamp when limit resets

When rate limit is exceeded, API returns `429 Too Many Requests` with `retry_after` in seconds.

---

## Event Ingestion

### POST /v1/events

Submit analytics events for processing.

**Request**

```http
POST /v1/events HTTP/1.1
Content-Type: application/json

{
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
}
```

**Event Types**

Three analytics levels are supported:

#### 1. Minimal Event (Required Fields Only)

```json
{
  "version": "1.0.0",
  "tool": "get_forecast",
  "status": "success",
  "timestamp_hour": "2025-11-12T20:00:00Z",
  "analytics_level": "minimal"
}
```

#### 2. Standard Event (Performance Metrics)

```json
{
  "version": "1.0.0",
  "tool": "get_current_conditions",
  "status": "success",
  "timestamp_hour": "2025-11-12T20:00:00Z",
  "analytics_level": "standard",
  "response_time_ms": 120,
  "service": "noaa",
  "cache_hit": true,
  "retry_count": 0,
  "country": "US"
}
```

#### 3. Detailed Event (Session Tracking)

```json
{
  "version": "1.0.0",
  "tool": "get_alerts",
  "status": "success",
  "timestamp_hour": "2025-11-12T20:00:00Z",
  "analytics_level": "detailed",
  "response_time_ms": 95,
  "service": "openmeteo",
  "cache_hit": false,
  "country": "CA",
  "session_id": "abc123def456",
  "sequence_number": 5,
  "parameters": {
    "location_type": "coordinates"
  }
}
```

**Error Events**

For failed operations, include `error_type`:

```json
{
  "version": "1.0.0",
  "tool": "get_forecast",
  "status": "error",
  "timestamp_hour": "2025-11-12T20:00:00Z",
  "analytics_level": "standard",
  "error_type": "NetworkError"
}
```

**Field Reference**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | MCP server version (semver) |
| `tool` | string | Yes | Tool name (e.g., "get_forecast") |
| `status` | string | Yes | "success" or "error" |
| `timestamp_hour` | string | Yes | ISO 8601 datetime (hourly precision) |
| `analytics_level` | string | Yes | "minimal", "standard", or "detailed" |
| `response_time_ms` | number | No | Response time in milliseconds |
| `service` | string | No | "noaa" or "openmeteo" |
| `cache_hit` | boolean | No | Whether response was cached |
| `retry_count` | number | No | Number of retries (0 if first try) |
| `country` | string | No | ISO 3166-1 alpha-2 country code |
| `error_type` | string | No | Error type (if status is "error") |
| `session_id` | string | No | Hashed session identifier |
| `sequence_number` | number | No | Event sequence in session |
| `parameters` | object | No | Anonymized parameters (no PII!) |

**Batch Limits**

- Maximum events per batch: 100
- Maximum request size: 100 KB

**Response**

```json
{
  "status": "accepted",
  "count": 1,
  "timestamp": "2025-11-12T20:05:30.123Z"
}
```

**Status Codes**

- `200 OK` - Events accepted
- `400 Bad Request` - Validation failed
- `429 Too Many Requests` - Rate limit exceeded
- `503 Service Unavailable` - Queue full, retry later

---

## Statistics Endpoints

### GET /v1/stats/overview

Get summary statistics across all tools.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | "30d" | Time period: "7d", "30d", or "90d" |

**Request**

```http
GET /v1/stats/overview?period=30d HTTP/1.1
```

**Response**

```json
{
  "period": "30d",
  "start_date": "2025-10-13T00:00:00.000Z",
  "end_date": "2025-11-12T23:59:59.999Z",
  "summary": {
    "total_calls": 125000,
    "unique_versions": 15,
    "active_installs": 250,
    "success_rate": 0.985,
    "avg_response_time_ms": 145.2
  },
  "tools": [
    {
      "name": "get_forecast",
      "calls": 85000,
      "success_rate": 0.99,
      "avg_response_time_ms": 150.5
    }
  ],
  "errors": [
    {
      "type": "NetworkError",
      "count": 1250,
      "percentage": 0.67,
      "last_seen": "2025-11-12T19:45:00.000Z"
    }
  ],
  "cache_hit_rate": 0.75
}
```

### GET /v1/stats/tools

Get statistics for all tools.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | "30d" | Time period: "7d", "30d", or "90d" |

**Request**

```http
GET /v1/stats/tools?period=7d HTTP/1.1
```

**Response**

```json
{
  "period": "7d",
  "tools": [
    {
      "name": "get_forecast",
      "calls": 20000,
      "success_rate": 0.99,
      "avg_response_time_ms": 148.5
    },
    {
      "name": "get_current_conditions",
      "calls": 15000,
      "success_rate": 0.98,
      "avg_response_time_ms": 95.2
    }
  ]
}
```

### GET /v1/stats/tool/:toolName

Get detailed statistics for a specific tool.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `toolName` | string | Tool name (e.g., "get_forecast") |

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | "30d" | Time period: "7d", "30d", or "90d" |

**Request**

```http
GET /v1/stats/tool/get_forecast?period=30d HTTP/1.1
```

**Response**

```json
{
  "tool": "get_forecast",
  "period": "30d",
  "summary": {
    "name": "get_forecast",
    "calls": 85000,
    "success_rate": 0.99,
    "avg_response_time_ms": 150.5
  },
  "daily_data": [
    {
      "date": "2025-11-12",
      "calls": 2850,
      "success_rate": 0.99,
      "avg_response_time_ms": 148.2
    }
  ],
  "versions": [
    {
      "version": "1.0.0",
      "calls": 50000,
      "percentage": 0.59
    },
    {
      "version": "1.1.0",
      "calls": 35000,
      "percentage": 0.41
    }
  ],
  "countries": [
    {
      "country": "US",
      "calls": 45000,
      "percentage": 0.53
    },
    {
      "country": "CA",
      "calls": 20000,
      "percentage": 0.24
    }
  ]
}
```

**Error Response**

If tool not found:

```json
{
  "error": "not_found",
  "details": "Tool 'unknown_tool' not found or has no data"
}
```

### GET /v1/stats/errors

Get error statistics.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | "30d" | Time period: "7d", "30d", or "90d" |

**Request**

```http
GET /v1/stats/errors?period=30d HTTP/1.1
```

**Response**

```json
{
  "period": "30d",
  "errors": [
    {
      "type": "NetworkError",
      "count": 1250,
      "percentage": 0.67,
      "last_seen": "2025-11-12T19:45:00.000Z"
    },
    {
      "type": "TimeoutError",
      "count": 425,
      "percentage": 0.23,
      "last_seen": "2025-11-12T18:30:00.000Z"
    }
  ]
}
```

### GET /v1/stats/performance

Get performance metrics.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | "30d" | Time period: "7d", "30d", or "90d" |

**Request**

```http
GET /v1/stats/performance?period=30d HTTP/1.1
```

**Response**

```json
{
  "period": "30d",
  "response_times": {
    "avg_ms": 145.2,
    "p50_ms": 125.0,
    "p95_ms": 285.5,
    "p99_ms": 450.2
  },
  "cache_performance": {
    "hit_rate": 0.75,
    "total_hits": 93750,
    "total_misses": 31250
  },
  "service_distribution": {
    "noaa": 75000,
    "openmeteo": 50000
  }
}
```

---

## System Endpoints

### GET /v1/health

Health check endpoint (no rate limit).

**Request**

```http
GET /v1/health HTTP/1.1
```

**Response - Healthy**

```json
{
  "status": "healthy",
  "timestamp": "2025-11-12T20:30:45.123Z",
  "uptime": 86400.5
}
```

**Response - Unhealthy**

```json
{
  "status": "unhealthy",
  "database": "disconnected"
}
```

**Status Codes**

- `200 OK` - Service healthy
- `503 Service Unavailable` - Service unhealthy

### GET /v1/status

Detailed system status.

**Request**

```http
GET /v1/status HTTP/1.1
```

**Response**

```json
{
  "status": "healthy",
  "timestamp": "2025-11-12T20:30:45.123Z",
  "uptime_seconds": 86400,
  "database": {
    "connected": true,
    "total_connections": 10,
    "idle_connections": 8,
    "waiting_count": 0
  },
  "queue": {
    "depth": 15
  },
  "memory": {
    "used_mb": 128,
    "total_mb": 256
  }
}
```

### GET /metrics

Prometheus metrics endpoint (no rate limit).

**Request**

```http
GET /metrics HTTP/1.1
```

**Response**

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",route="/v1/events",status_code="200"} 1250

# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",route="/v1/events",status_code="200",le="0.005"} 1000

# HELP events_received_total Total number of analytics events received
# TYPE events_received_total counter
events_received_total{analytics_level="standard",tool="get_forecast"} 85000
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "error_code",
  "details": "Human-readable error message",
  "retry_after": 60
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `validation_failed` | 400 | Request validation failed |
| `invalid_request` | 400 | Invalid request parameters |
| `not_found` | 404 | Resource not found |
| `rate_limit_exceeded` | 429 | Too many requests |
| `service_unavailable` | 503 | Service temporarily unavailable |
| `internal_server_error` | 500 | Internal server error |

### Validation Error Example

```json
{
  "error": "validation_failed",
  "details": [
    "events[0].version: Required",
    "events[0].timestamp_hour: Invalid date format"
  ]
}
```

### Rate Limit Error Example

```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests, please try again later",
  "retry_after": 45
}
```

---

## Code Examples

### JavaScript/TypeScript

```typescript
// Event ingestion
async function sendAnalytics(event: AnalyticsEvent) {
  const response = await fetch('http://localhost:3000/v1/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [event] })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details);
  }

  return response.json();
}

// Get statistics
async function getStats(period = '30d') {
  const response = await fetch(
    `http://localhost:3000/v1/stats/overview?period=${period}`
  );
  return response.json();
}
```

### Python

```python
import requests

# Event ingestion
def send_analytics(event):
    response = requests.post(
        'http://localhost:3000/v1/events',
        json={'events': [event]}
    )
    response.raise_for_status()
    return response.json()

# Get statistics
def get_stats(period='30d'):
    response = requests.get(
        f'http://localhost:3000/v1/stats/overview',
        params={'period': period}
    )
    return response.json()
```

### cURL

```bash
# Event ingestion
curl -X POST http://localhost:3000/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "version": "1.0.0",
      "tool": "get_forecast",
      "status": "success",
      "timestamp_hour": "2025-11-12T20:00:00Z",
      "analytics_level": "standard",
      "response_time_ms": 150,
      "service": "noaa",
      "cache_hit": true,
      "country": "US"
    }]
  }'

# Get statistics
curl http://localhost:3000/v1/stats/overview?period=30d
```

---

## Best Practices

### 1. Batch Events

Send multiple events in a single request when possible (max 100):

```json
{
  "events": [
    { /* event 1 */ },
    { /* event 2 */ },
    { /* event 3 */ }
  ]
}
```

### 2. Handle Rate Limits

Respect rate limits and implement exponential backoff:

```typescript
async function sendWithRetry(events, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sendAnalytics(events);
    } catch (error) {
      if (error.statusCode === 429) {
        const delay = Math.pow(2, i) * 1000;
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}
```

### 3. Anonymize Data

**NEVER** send PII:
- ❌ Location names, addresses
- ❌ Coordinates (lat/lon)
- ❌ User identifiers
- ❌ Personal information
- ✅ Country codes only
- ✅ Hashed session IDs
- ✅ Generic parameter types

### 4. Use Appropriate Analytics Level

- **Minimal**: Basic usage tracking
- **Standard**: Performance monitoring
- **Detailed**: Session analysis (with user consent)

---

**Last Updated**: 2025-11-12
**API Version**: v1
**Stability**: Stable
