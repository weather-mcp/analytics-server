import { describe, it, expect, vi } from 'vitest';
import { validateEventBatch, validateEvent, getValidTools } from '../../src/api/validation.js';
import type { AnalyticsEvent, StandardEvent } from '../../src/types/events.js';

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  apiLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Event Validation', () => {
  describe('validateEvent', () => {
    it('should accept valid minimal event', () => {
      const event: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(event);
    });

    it('should accept valid standard event', () => {
      const event: StandardEvent = {
        version: '1.0.0',
        tool: 'get_current_conditions',
        status: 'success',
        timestamp_hour: '2025-11-11T15:00:00Z',
        analytics_level: 'standard',
        response_time_ms: 150,
        service: 'noaa',
        cache_hit: true,
        retry_count: 0,
        country: 'US',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(event);
    });

    it('should accept valid error event', () => {
      const event: StandardEvent = {
        version: '1.0.0',
        tool: 'get_alerts',
        status: 'error',
        timestamp_hour: '2025-11-11T16:00:00Z',
        analytics_level: 'standard',
        error_type: 'ServiceUnavailableError',
        response_time_ms: 5000,
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should reject event with invalid tool name', () => {
      const event = {
        version: '1.0.0',
        tool: 'invalid_tool',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject event with invalid status', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'pending',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should reject event with invalid timestamp format', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: 'not-a-timestamp',
        analytics_level: 'minimal',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should reject event with response_time_ms exceeding max', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        response_time_ms: 150000, // Exceeds 120000 max
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should reject event with invalid country code', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        country: 'USA', // Should be 2 characters
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should reject event with invalid service name', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        service: 'invalid_service',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEventBatch', () => {
    it('should accept valid batch', () => {
      const batch = {
        events: [
          {
            version: '1.0.0',
            tool: 'get_forecast',
            status: 'success',
            timestamp_hour: '2025-11-11T14:00:00Z',
            analytics_level: 'minimal',
          },
          {
            version: '1.0.0',
            tool: 'get_current_conditions',
            status: 'success',
            timestamp_hour: '2025-11-11T14:00:00Z',
            analytics_level: 'minimal',
          },
        ],
      };

      const result = validateEventBatch(batch);
      expect(result.valid).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should reject empty batch', () => {
      const batch = {
        events: [],
      };

      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject batch exceeding 100 events', () => {
      const events = Array.from({ length: 101 }, () => ({
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      }));

      const batch = { events };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
    });

    it('should reject batch with invalid structure', () => {
      const batch = {
        items: [], // Wrong field name
      };

      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
    });

    it('should handle mixed valid/invalid events', () => {
      const batch = {
        events: [
          {
            version: '1.0.0',
            tool: 'get_forecast',
            status: 'success',
            timestamp_hour: '2025-11-11T14:00:00Z',
            analytics_level: 'minimal',
          },
          {
            version: '1.0.0',
            tool: 'invalid_tool',
            status: 'success',
            timestamp_hour: '2025-11-11T14:00:00Z',
            analytics_level: 'minimal',
          },
        ],
      };

      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
    });
  });

  describe('PII Detection', () => {
    it('should reject events with latitude/longitude', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
        latitude: 40.7128,
        longitude: -74.0060,
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('PII');
    });

    it('should reject events with user_id', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
        user_id: '12345',
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('PII');
    });

    it('should reject events with email', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
        email: 'user@example.com',
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
    });

    it('should reject events with IP address', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
        ip: '192.168.1.1',
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
    });

    it('should reject events with PII in parameters', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'detailed',
        parameters: {
          latitude: 40.7128,
          longitude: -74.0060,
        },
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
    });

    it('should accept events with allowed parameters', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'detailed',
        parameters: {
          units: 'metric',
          days: 5,
        },
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(true);
    });
  });

  describe('Timestamp Validation', () => {
    it('should reject timestamps not rounded to the hour', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:23:45Z', // Not rounded
        analytics_level: 'minimal',
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('rounded to the hour');
    });

    it('should accept properly rounded timestamps', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(true);
    });
  });

  describe('Error Event Validation', () => {
    it('should require error_type for standard error events', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'error',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        // Missing error_type
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('error_type');
    });

    it('should accept error events with error_type', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'error',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        error_type: 'ServiceUnavailableError',
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(true);
    });

    it('should allow minimal error events without error_type', () => {
      const event = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'error',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      const batch = { events: [event] };
      const result = validateEventBatch(batch);
      expect(result.valid).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('should return list of valid tools', () => {
      const tools = getValidTools();
      expect(tools).toContain('get_forecast');
      expect(tools).toContain('get_current_conditions');
      expect(tools).toContain('get_alerts');
    });
  });
});
