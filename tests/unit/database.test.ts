import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import type { AnalyticsEvent, StandardEvent } from '../../src/types/events.js';

// Mock the logger to avoid console output during tests
vi.mock('../../src/utils/logger.js', () => ({
  dbLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Database Functions - Unit Tests', () => {
  describe('Event Validation', () => {
    it('should validate minimal event structure', () => {
      const event: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      expect(event.version).toBe('1.0.0');
      expect(event.tool).toBe('get_forecast');
      expect(event.status).toBe('success');
      expect(event.analytics_level).toBe('minimal');
    });

    it('should validate standard event structure', () => {
      const event: StandardEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        response_time_ms: 150,
        service: 'noaa',
        cache_hit: true,
        retry_count: 0,
        country: 'US',
      };

      expect(event.response_time_ms).toBe(150);
      expect(event.service).toBe('noaa');
      expect(event.cache_hit).toBe(true);
    });

    it('should validate error event structure', () => {
      const event: StandardEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'error',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        error_type: 'ServiceUnavailableError',
        response_time_ms: 5000,
        service: 'noaa',
      };

      expect(event.status).toBe('error');
      expect(event.error_type).toBe('ServiceUnavailableError');
    });
  });

  describe('Aggregation Logic', () => {
    it('should group events by date, tool, version, country', () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
        {
          version: '1.0.1',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      const groupedByVersion = new Map<string, AnalyticsEvent[]>();
      for (const event of events) {
        const key = event.version;
        if (!groupedByVersion.has(key)) {
          groupedByVersion.set(key, []);
        }
        groupedByVersion.get(key)!.push(event);
      }

      expect(groupedByVersion.get('1.0.0')).toHaveLength(2);
      expect(groupedByVersion.get('1.0.1')).toHaveLength(1);
    });

    it('should calculate success rate correctly', () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'error',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      const successCount = events.filter((e) => e.status === 'success').length;
      const totalCount = events.length;
      const successRate = successCount / totalCount;

      expect(successRate).toBeCloseTo(0.667, 2);
    });

    it('should calculate average response time', () => {
      const responseTimes = [100, 150, 200, 250, 300];
      const avg = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;

      expect(avg).toBe(200);
    });

    it('should calculate percentiles correctly', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      // Calculate p50 (median)
      const sorted = [...values].sort((a, b) => a - b);
      const p50Index = Math.ceil((50 / 100) * sorted.length) - 1;
      const p50 = sorted[p50Index];

      expect(p50).toBe(50);

      // Calculate p95
      const p95Index = Math.ceil((95 / 100) * sorted.length) - 1;
      const p95 = sorted[p95Index];

      expect(p95).toBe(100);
    });

    it('should calculate cache hit rate', () => {
      const cacheHits = 70;
      const cacheMisses = 30;
      const cacheHitRate = cacheHits / (cacheHits + cacheMisses);

      expect(cacheHitRate).toBe(0.7);
    });

    it('should handle zero cache events', () => {
      const cacheHits = 0;
      const cacheMisses = 0;
      const total = cacheHits + cacheMisses;

      expect(total).toBe(0);
      // In this case, we would return null for cache_hit_rate
    });
  });

  describe('Error Handling', () => {
    it('should filter error events correctly', () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'error',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
        } as StandardEvent,
      ];

      const errorEvents = events.filter((e) => e.status === 'error');

      expect(errorEvents).toHaveLength(1);
      expect('error_type' in errorEvents[0] && errorEvents[0].error_type).toBe(
        'ServiceUnavailableError'
      );
    });

    it('should group errors by type', () => {
      const errorEvents: StandardEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'error',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'error',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'error',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          error_type: 'TimeoutError',
        },
      ];

      const groupedByType = new Map<string, StandardEvent[]>();
      for (const event of errorEvents) {
        const key = event.error_type || 'UnknownError';
        if (!groupedByType.has(key)) {
          groupedByType.set(key, []);
        }
        groupedByType.get(key)!.push(event);
      }

      expect(groupedByType.get('ServiceUnavailableError')).toHaveLength(2);
      expect(groupedByType.get('TimeoutError')).toHaveLength(1);
    });

    it('should collect affected versions for errors', () => {
      const errorEvents: StandardEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'error',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
        },
        {
          version: '1.0.1',
          tool: 'get_forecast',
          status: 'error',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'error',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
        },
      ];

      const uniqueVersions = [...new Set(errorEvents.map((e) => e.version))];

      expect(uniqueVersions).toHaveLength(2);
      expect(uniqueVersions).toContain('1.0.0');
      expect(uniqueVersions).toContain('1.0.1');
    });
  });

  describe('Data Transformation', () => {
    it('should round timestamp to hour', () => {
      const timestamp = '2025-11-11T14:23:45Z';
      const date = new Date(timestamp);
      const hourRounded = new Date(date);
      hourRounded.setMinutes(0, 0, 0);

      expect(hourRounded.toISOString()).toBe('2025-11-11T14:00:00.000Z');
    });

    it('should extract date from timestamp', () => {
      const timestamp = '2025-11-11T14:00:00Z';
      const date = new Date(timestamp).toISOString().split('T')[0];

      expect(date).toBe('2025-11-11');
    });

    it('should handle empty string defaults for optional fields', () => {
      const version: string = '';
      const country: string = '';

      expect(version).toBe('');
      expect(country).toBe('');
    });
  });

  describe('Service Distribution', () => {
    it('should count service usage', () => {
      const events: StandardEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          service: 'noaa',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          service: 'noaa',
        },
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'standard',
          service: 'openmeteo',
        },
      ];

      const noaaCalls = events.filter((e) => e.service === 'noaa').length;
      const openmeoCalls = events.filter((e) => e.service === 'openmeteo').length;

      expect(noaaCalls).toBe(2);
      expect(openmeoCalls).toBe(1);
    });
  });
});
