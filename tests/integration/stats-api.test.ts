import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server } from '../../src/api/index.js';
import { pool, insertEvents, updateAggregations } from '../../src/database/index.js';
import { redis } from '../../src/queue/index.js';
import type { AnalyticsEvent } from '../../src/types/events.js';

describe('Stats API Integration Tests', () => {
  beforeAll(async () => {
    // Clear stats cache before tests
    const keys = await redis.keys('stats:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Insert test data
    const testEvents: AnalyticsEvent[] = [
      {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: new Date().toISOString(),
        analytics_level: 'standard',
        response_time_ms: 120,
        service: 'noaa',
        cache_hit: true,
        country: 'US',
      },
      {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: new Date().toISOString(),
        analytics_level: 'standard',
        response_time_ms: 150,
        service: 'openmeteo',
        cache_hit: false,
        country: 'CA',
      },
      {
        version: '1.0.1',
        tool: 'get_current_conditions',
        status: 'success',
        timestamp_hour: new Date().toISOString(),
        analytics_level: 'standard',
        response_time_ms: 80,
        service: 'noaa',
        cache_hit: true,
        country: 'US',
      },
      {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'error',
        timestamp_hour: new Date().toISOString(),
        analytics_level: 'standard',
        error_type: 'NetworkError',
        country: 'GB',
      },
    ];

    // Insert events and update aggregations
    await insertEvents(testEvents);
    await updateAggregations(testEvents);

    // Wait a bit for aggregations to settle
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM events WHERE version IN ($1, $2)', ['1.0.0', '1.0.1']);
    await pool.query('DELETE FROM daily_aggregations WHERE version IN ($1, $2)', ['1.0.0', '1.0.1']);
    await pool.query('DELETE FROM hourly_aggregations WHERE version IN ($1, $2)', ['1.0.0', '1.0.1']);
    await pool.query('DELETE FROM error_summary WHERE tool IN ($1, $2)', [
      'get_forecast',
      'get_current_conditions',
    ]);

    // Clear cache
    const keys = await redis.keys('stats:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    await server.close();
  });

  describe('GET /v1/stats/overview', () => {
    it('should return overview statistics with default period (30d)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/overview',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.period).toBe('30d');
      expect(body.start_date).toBeDefined();
      expect(body.end_date).toBeDefined();
      expect(body.summary).toBeDefined();
      expect(body.summary.total_calls).toBeGreaterThan(0);
      expect(body.summary.unique_versions).toBeGreaterThan(0);
      expect(body.summary.success_rate).toBeGreaterThanOrEqual(0);
      expect(body.summary.success_rate).toBeLessThanOrEqual(1);
      expect(body.tools).toBeInstanceOf(Array);
      expect(body.errors).toBeInstanceOf(Array);
      expect(body.cache_hit_rate).toBeGreaterThanOrEqual(0);
      expect(body.cache_hit_rate).toBeLessThanOrEqual(1);
    });

    it('should return overview statistics for 7d period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/overview?period=7d',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBe('7d');
    });

    it('should return overview statistics for 90d period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/overview?period=90d',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBe('90d');
    });

    it('should reject invalid period format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/overview?period=invalid',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('invalid_request');
    });

    it('should reject unsupported period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/overview?period=365d',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('invalid_request');
    });

    it('should use cache on second request', async () => {
      // First request - cache miss
      const response1 = await server.inject({
        method: 'GET',
        url: '/v1/stats/overview?period=30d',
      });
      expect(response1.statusCode).toBe(200);

      // Second request - cache hit
      const response2 = await server.inject({
        method: 'GET',
        url: '/v1/stats/overview?period=30d',
      });
      expect(response2.statusCode).toBe(200);

      // Results should be identical
      expect(response1.body).toBe(response2.body);
    });
  });

  describe('GET /v1/stats/tools', () => {
    it('should return tools statistics with default period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/tools',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.period).toBe('30d');
      expect(body.tools).toBeInstanceOf(Array);

      if (body.tools.length > 0) {
        const tool = body.tools[0];
        expect(tool.name).toBeDefined();
        expect(tool.calls).toBeGreaterThan(0);
        expect(tool.success_rate).toBeGreaterThanOrEqual(0);
        expect(tool.success_rate).toBeLessThanOrEqual(1);
        expect(tool.avg_response_time_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return tools statistics for 7d period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/tools?period=7d',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBe('7d');
    });

    it('should order tools by call count (descending)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/tools',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      if (body.tools.length > 1) {
        for (let i = 0; i < body.tools.length - 1; i++) {
          expect(body.tools[i].calls).toBeGreaterThanOrEqual(body.tools[i + 1].calls);
        }
      }
    });
  });

  describe('GET /v1/stats/tool/:toolName', () => {
    it('should return detailed statistics for existing tool', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/tool/get_forecast',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.tool).toBe('get_forecast');
      expect(body.period).toBe('30d');
      expect(body.summary).toBeDefined();
      expect(body.summary.name).toBe('get_forecast');
      expect(body.summary.calls).toBeGreaterThan(0);
      expect(body.daily_data).toBeInstanceOf(Array);
      expect(body.versions).toBeInstanceOf(Array);
      expect(body.countries).toBeInstanceOf(Array);

      // Verify daily data structure
      if (body.daily_data.length > 0) {
        const day = body.daily_data[0];
        expect(day.date).toBeDefined();
        expect(day.calls).toBeGreaterThan(0);
        expect(day.success_rate).toBeGreaterThanOrEqual(0);
        expect(day.success_rate).toBeLessThanOrEqual(1);
        expect(day.avg_response_time_ms).toBeGreaterThanOrEqual(0);
      }

      // Verify versions structure
      if (body.versions.length > 0) {
        const version = body.versions[0];
        expect(version.version).toBeDefined();
        expect(version.calls).toBeGreaterThan(0);
        expect(version.percentage).toBeGreaterThanOrEqual(0);
        expect(version.percentage).toBeLessThanOrEqual(1);
      }

      // Verify countries structure
      if (body.countries.length > 0) {
        const country = body.countries[0];
        expect(country.country).toBeDefined();
        expect(country.calls).toBeGreaterThan(0);
        expect(country.percentage).toBeGreaterThanOrEqual(0);
        expect(country.percentage).toBeLessThanOrEqual(1);
      }
    });

    it('should return 404 for non-existent tool', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/tool/non_existent_tool',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('not_found');
    });

    it('should support custom period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/tool/get_forecast?period=7d',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBe('7d');
    });
  });

  describe('GET /v1/stats/errors', () => {
    it('should return error statistics with default period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/errors',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.period).toBe('30d');
      expect(body.errors).toBeInstanceOf(Array);

      if (body.errors.length > 0) {
        const error = body.errors[0];
        expect(error.type).toBeDefined();
        expect(error.count).toBeGreaterThan(0);
        expect(error.percentage).toBeGreaterThanOrEqual(0);
        expect(error.percentage).toBeLessThanOrEqual(1);
      }
    });

    it('should return error statistics for 7d period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/errors?period=7d',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBe('7d');
    });

    it('should order errors by count (descending)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/errors',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      if (body.errors.length > 1) {
        for (let i = 0; i < body.errors.length - 1; i++) {
          expect(body.errors[i].count).toBeGreaterThanOrEqual(body.errors[i + 1].count);
        }
      }
    });
  });

  describe('GET /v1/stats/performance', () => {
    it('should return performance statistics with default period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/performance',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.period).toBe('30d');
      expect(body.response_times).toBeDefined();
      expect(body.response_times.avg_ms).toBeGreaterThanOrEqual(0);
      expect(body.response_times.p50_ms).toBeGreaterThanOrEqual(0);
      expect(body.response_times.p95_ms).toBeGreaterThanOrEqual(0);
      expect(body.response_times.p99_ms).toBeGreaterThanOrEqual(0);

      expect(body.cache_performance).toBeDefined();
      expect(body.cache_performance.hit_rate).toBeGreaterThanOrEqual(0);
      expect(body.cache_performance.hit_rate).toBeLessThanOrEqual(1);
      expect(body.cache_performance.total_hits).toBeGreaterThanOrEqual(0);
      expect(body.cache_performance.total_misses).toBeGreaterThanOrEqual(0);

      expect(body.service_distribution).toBeDefined();
      expect(body.service_distribution.noaa).toBeGreaterThanOrEqual(0);
      expect(body.service_distribution.openmeteo).toBeGreaterThanOrEqual(0);
    });

    it('should return performance statistics for 7d period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/performance?period=7d',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBe('7d');
    });

    it('should have consistent response time percentiles', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/stats/performance',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const { avg_ms, p50_ms, p95_ms, p99_ms } = body.response_times;

      // Percentiles should be in ascending order (when data exists)
      if (p50_ms > 0 && p95_ms > 0) {
        expect(p50_ms).toBeLessThanOrEqual(p95_ms);
      }
      if (p95_ms > 0 && p99_ms > 0) {
        expect(p95_ms).toBeLessThanOrEqual(p99_ms);
      }
    });
  });

  describe('Cache behavior', () => {
    it('should cache results across different endpoints', async () => {
      // Clear cache first
      const keys = await redis.keys('stats:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      // Make requests to all endpoints
      const endpoints = [
        '/v1/stats/overview',
        '/v1/stats/tools',
        '/v1/stats/errors',
        '/v1/stats/performance',
      ];

      for (const endpoint of endpoints) {
        // First request - cache miss
        const response1 = await server.inject({
          method: 'GET',
          url: endpoint,
        });
        expect(response1.statusCode).toBe(200);

        // Second request - cache hit
        const response2 = await server.inject({
          method: 'GET',
          url: endpoint,
        });
        expect(response2.statusCode).toBe(200);

        // Results should be identical
        expect(response1.body).toBe(response2.body);
      }
    });
  });
});
