import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server } from '../../src/api/index.js';
import { clearQueue } from '../../src/queue/index.js';
import type { EventBatchResponse, ErrorResponse } from '../../src/types/events.js';

describe('API Integration Tests', () => {
  beforeAll(async () => {
    // Clear queue before tests
    await clearQueue();
  });

  afterAll(async () => {
    // Clean up
    await clearQueue();
    await server.close();
  });

  describe('GET /v1/health', () => {
    it('should return healthy status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /v1/status', () => {
    it('should return detailed system status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(body.database).toBeDefined();
      expect(body.queue).toBeDefined();
      expect(body.memory).toBeDefined();
    });
  });

  describe('POST /v1/events', () => {
    it('should accept valid minimal event batch', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [
            {
              version: '1.0.0',
              tool: 'get_forecast',
              status: 'success',
              timestamp_hour: '2025-11-11T14:00:00Z',
              analytics_level: 'minimal',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as EventBatchResponse;
      expect(body.status).toBe('accepted');
      expect(body.count).toBe(1);
      expect(body.timestamp).toBeDefined();
    });

    it('should accept valid standard event batch', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [
            {
              version: '1.0.0',
              tool: 'get_current_conditions',
              status: 'success',
              timestamp_hour: '2025-11-11T15:00:00Z',
              analytics_level: 'standard',
              response_time_ms: 150,
              service: 'noaa',
              cache_hit: true,
              country: 'US',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as EventBatchResponse;
      expect(body.status).toBe('accepted');
      expect(body.count).toBe(1);
    });

    it('should accept error events', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [
            {
              version: '1.0.0',
              tool: 'get_alerts',
              status: 'error',
              timestamp_hour: '2025-11-11T16:00:00Z',
              analytics_level: 'standard',
              error_type: 'ServiceUnavailableError',
              response_time_ms: 5000,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as EventBatchResponse;
      expect(body.status).toBe('accepted');
    });

    it('should accept batch with multiple events', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [
            {
              version: '1.0.0',
              tool: 'get_forecast',
              status: 'success',
              timestamp_hour: '2025-11-11T17:00:00Z',
              analytics_level: 'minimal',
            },
            {
              version: '1.0.0',
              tool: 'get_current_conditions',
              status: 'success',
              timestamp_hour: '2025-11-11T17:00:00Z',
              analytics_level: 'minimal',
            },
            {
              version: '1.0.0',
              tool: 'get_alerts',
              status: 'success',
              timestamp_hour: '2025-11-11T17:00:00Z',
              analytics_level: 'minimal',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as EventBatchResponse;
      expect(body.count).toBe(3);
    });

    it('should reject empty batch', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error).toBe('validation_failed');
    });

    it('should reject batch exceeding 100 events', async () => {
      const events = Array.from({ length: 101 }, () => ({
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T18:00:00Z',
        analytics_level: 'minimal',
      }));

      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: { events },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error).toBe('validation_failed');
    });

    it('should reject events with invalid tool name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [
            {
              version: '1.0.0',
              tool: 'invalid_tool',
              status: 'success',
              timestamp_hour: '2025-11-11T19:00:00Z',
              analytics_level: 'minimal',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error).toBe('validation_failed');
    });

    it('should reject events with PII', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [
            {
              version: '1.0.0',
              tool: 'get_forecast',
              status: 'success',
              timestamp_hour: '2025-11-11T20:00:00Z',
              analytics_level: 'minimal',
              latitude: 40.7128, // PII
              longitude: -74.0060, // PII
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error).toBe('validation_failed');
      expect(body.details).toBeDefined();
    });

    it('should reject events with non-rounded timestamps', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [
            {
              version: '1.0.0',
              tool: 'get_forecast',
              status: 'success',
              timestamp_hour: '2025-11-11T14:23:45Z', // Not rounded
              analytics_level: 'minimal',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error).toBe('validation_failed');
    });

    it('should reject error events without error_type (standard level)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          events: [
            {
              version: '1.0.0',
              tool: 'get_forecast',
              status: 'error',
              timestamp_hour: '2025-11-11T21:00:00Z',
              analytics_level: 'standard',
              // Missing error_type
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error).toBe('validation_failed');
    });

    it('should reject malformed JSON', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: 'invalid json',
        headers: {
          'content-type': 'application/json',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject requests with missing events field', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/events',
        payload: {
          items: [], // Wrong field name
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error).toBe('validation_failed');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make requests up to the limit (60 per minute)
      // For testing, we'll make just a few requests and check headers
      const responses = [];

      for (let i = 0; i < 5; i++) {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/events',
          payload: {
            events: [
              {
                version: '1.0.0',
                tool: 'get_forecast',
                status: 'success',
                timestamp_hour: '2025-11-11T22:00:00Z',
                analytics_level: 'minimal',
              },
            ],
          },
        });
        responses.push(response);
      }

      // Check that rate limit headers are present
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.headers['x-ratelimit-limit']).toBeDefined();
      expect(lastResponse.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/health',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/unknown',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should handle unsupported methods', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/v1/events',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
