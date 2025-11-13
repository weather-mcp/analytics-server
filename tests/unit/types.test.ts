import { describe, it, expect } from 'vitest';
import type {
  AnalyticsEvent,
  MinimalEvent,
  StandardEvent,
  DetailedEvent,
  EventRecord,
  DailyAggregation,
  HourlyAggregation,
  ErrorSummary,
  EventBatchRequest,
  EventBatchResponse,
  ErrorResponse,
  StatsOverview,
  ToolStats,
  ErrorStats,
  ValidationResult,
} from '../../src/types/events.js';

describe('Event Types', () => {
  describe('MinimalEvent', () => {
    it('should accept valid minimal event', () => {
      const event: MinimalEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      expect(event.version).toBe('1.0.0');
      expect(event.analytics_level).toBe('minimal');
    });

    it('should have required fields only', () => {
      const event: MinimalEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      // TypeScript ensures no extra required fields
      expect(Object.keys(event)).toEqual([
        'version',
        'tool',
        'status',
        'timestamp_hour',
        'analytics_level',
      ]);
    });
  });

  describe('StandardEvent', () => {
    it('should accept valid standard event', () => {
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

      expect(event.analytics_level).toBe('standard');
      expect(event.response_time_ms).toBe(150);
    });

    it('should accept standard event without optional fields', () => {
      const event: StandardEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
      };

      expect(event.analytics_level).toBe('standard');
    });

    it('should accept error event with error_type', () => {
      const event: StandardEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'error',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        error_type: 'NetworkError',
      };

      expect(event.status).toBe('error');
      expect(event.error_type).toBe('NetworkError');
    });
  });

  describe('DetailedEvent', () => {
    it('should accept valid detailed event', () => {
      const event: DetailedEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'detailed',
        response_time_ms: 150,
        service: 'noaa',
        cache_hit: true,
        retry_count: 0,
        country: 'US',
        parameters: { units: 'metric' },
        session_id: 'hashed_session_123',
        sequence_number: 1,
      };

      expect(event.analytics_level).toBe('detailed');
      expect(event.parameters).toEqual({ units: 'metric' });
    });

    it('should accept detailed event without optional fields', () => {
      const event: DetailedEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'detailed',
      };

      expect(event.analytics_level).toBe('detailed');
    });
  });

  describe('AnalyticsEvent Union', () => {
    it('should accept minimal event as AnalyticsEvent', () => {
      const event: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      expect(event.analytics_level).toBe('minimal');
    });

    it('should accept standard event as AnalyticsEvent', () => {
      const event: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        response_time_ms: 150,
      };

      expect(event.analytics_level).toBe('standard');
    });

    it('should accept detailed event as AnalyticsEvent', () => {
      const event: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'detailed',
        parameters: {},
      };

      expect(event.analytics_level).toBe('detailed');
    });
  });

  describe('Database Record Types', () => {
    it('should accept valid EventRecord', () => {
      const record: EventRecord = {
        id: 1,
        timestamp: new Date(),
        timestamp_hour: new Date(),
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        analytics_level: 'standard',
        response_time_ms: 150,
        service: 'noaa',
        cache_hit: true,
        retry_count: 0,
        country: 'US',
        parameters: null,
        session_id: null,
        sequence_number: null,
        error_type: null,
        created_at: new Date(),
      };

      expect(record.id).toBe(1);
      expect(record.created_at).toBeInstanceOf(Date);
    });

    it('should accept valid DailyAggregation', () => {
      const agg: DailyAggregation = {
        date: new Date(),
        tool: 'get_forecast',
        version: '1.0.0',
        country: 'US',
        total_calls: 100,
        success_calls: 95,
        error_calls: 5,
        avg_response_time_ms: 150,
        p50_response_time_ms: 140,
        p95_response_time_ms: 200,
        p99_response_time_ms: 250,
        min_response_time_ms: 50,
        max_response_time_ms: 500,
        cache_hit_count: 70,
        cache_miss_count: 30,
        cache_hit_rate: 0.7,
        noaa_calls: 60,
        openmeteo_calls: 40,
        total_retries: 10,
        avg_retry_count: 0.1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(agg.total_calls).toBe(100);
      expect(agg.cache_hit_rate).toBe(0.7);
    });

    it('should accept valid HourlyAggregation', () => {
      const agg: HourlyAggregation = {
        hour: new Date(),
        tool: 'get_forecast',
        version: '1.0.0',
        total_calls: 10,
        success_calls: 9,
        error_calls: 1,
        avg_response_time_ms: 150,
        p95_response_time_ms: 200,
        cache_hit_rate: 0.8,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(agg.total_calls).toBe(10);
      expect(agg.hour).toBeInstanceOf(Date);
    });

    it('should accept valid ErrorSummary', () => {
      const summary: ErrorSummary = {
        hour: new Date(),
        tool: 'get_forecast',
        error_type: 'NetworkError',
        count: 5,
        first_seen: new Date(),
        last_seen: new Date(),
        affected_versions: ['1.0.0', '1.0.1'],
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(summary.count).toBe(5);
      expect(summary.affected_versions).toHaveLength(2);
    });
  });

  describe('API Request/Response Types', () => {
    it('should accept valid EventBatchRequest', () => {
      const request: EventBatchRequest = {
        events: [
          {
            version: '1.0.0',
            tool: 'get_forecast',
            status: 'success',
            timestamp_hour: '2025-11-11T14:00:00Z',
            analytics_level: 'minimal',
          },
        ],
      };

      expect(request.events).toHaveLength(1);
    });

    it('should accept empty EventBatchRequest', () => {
      const request: EventBatchRequest = {
        events: [],
      };

      expect(request.events).toHaveLength(0);
    });

    it('should accept valid EventBatchResponse', () => {
      const response: EventBatchResponse = {
        status: 'accepted',
        count: 10,
        timestamp: new Date().toISOString(),
      };

      expect(response.status).toBe('accepted');
      expect(response.count).toBe(10);
    });

    it('should accept valid ErrorResponse', () => {
      const response: ErrorResponse = {
        error: 'validation_failed',
        details: 'Invalid tool name',
      };

      expect(response.error).toBe('validation_failed');
      expect(response.details).toBe('Invalid tool name');
    });

    it('should accept ErrorResponse with array details', () => {
      const response: ErrorResponse = {
        error: 'validation_failed',
        details: ['Error 1', 'Error 2'],
      };

      expect(response.details).toHaveLength(2);
    });

    it('should accept ErrorResponse with retry_after', () => {
      const response: ErrorResponse = {
        error: 'rate_limited',
        retry_after: 60,
      };

      expect(response.retry_after).toBe(60);
    });
  });

  describe('Stats API Types', () => {
    it('should accept valid StatsOverview', () => {
      const overview: StatsOverview = {
        period: '30d',
        start_date: '2025-10-12',
        end_date: '2025-11-11',
        summary: {
          total_calls: 1000,
          unique_versions: 3,
          active_installs: 50,
          success_rate: 0.95,
          avg_response_time_ms: 150,
        },
        tools: [],
        errors: [],
        cache_hit_rate: 0.7,
      };

      expect(overview.period).toBe('30d');
      expect(overview.summary.success_rate).toBe(0.95);
    });

    it('should accept valid ToolStats', () => {
      const stats: ToolStats = {
        name: 'get_forecast',
        calls: 500,
        success_rate: 0.98,
        avg_response_time_ms: 120,
        p95_response_time_ms: 200,
      };

      expect(stats.name).toBe('get_forecast');
      expect(stats.calls).toBe(500);
    });

    it('should accept ToolStats without p95', () => {
      const stats: ToolStats = {
        name: 'get_forecast',
        calls: 500,
        success_rate: 0.98,
        avg_response_time_ms: 120,
      };

      expect(stats.p95_response_time_ms).toBeUndefined();
    });

    it('should accept valid ErrorStats', () => {
      const stats: ErrorStats = {
        type: 'NetworkError',
        count: 10,
        percentage: 0.05,
        last_seen: '2025-11-11T14:00:00Z',
      };

      expect(stats.type).toBe('NetworkError');
      expect(stats.percentage).toBe(0.05);
    });
  });

  describe('ValidationResult', () => {
    it('should accept valid ValidationResult', () => {
      const result: ValidationResult<string> = {
        valid: true,
        data: 'test',
      };

      expect(result.valid).toBe(true);
      expect(result.data).toBe('test');
    });

    it('should accept invalid ValidationResult with errors', () => {
      const result: ValidationResult<string> = {
        valid: false,
        errors: ['Error 1', 'Error 2'],
      };

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should work with different data types', () => {
      const numberResult: ValidationResult<number> = {
        valid: true,
        data: 42,
      };

      const objectResult: ValidationResult<{ id: number }> = {
        valid: true,
        data: { id: 1 },
      };

      expect(numberResult.data).toBe(42);
      expect(objectResult.data?.id).toBe(1);
    });
  });

  describe('Type Guards', () => {
    it('should differentiate event types by analytics_level', () => {
      const event: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      if (event.analytics_level === 'minimal') {
        expect(event.analytics_level).toBe('minimal');
      }
    });

    it('should check for standard event fields', () => {
      const event: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        response_time_ms: 150,
      };

      if (event.analytics_level === 'standard') {
        expect('response_time_ms' in event).toBe(true);
      }
    });
  });

  describe('ServiceType', () => {
    it('should only accept valid service types', () => {
      const event: StandardEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        service: 'noaa',
      };

      expect(event.service).toBe('noaa');

      const event2: StandardEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'standard',
        service: 'openmeteo',
      };

      expect(event2.service).toBe('openmeteo');
    });
  });

  describe('EventStatus', () => {
    it('should only accept valid event statuses', () => {
      const successEvent: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      expect(successEvent.status).toBe('success');

      const errorEvent: AnalyticsEvent = {
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'error',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      };

      expect(errorEvent.status).toBe('error');
    });
  });
});
