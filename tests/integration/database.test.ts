import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import {
  pool,
  checkDatabaseHealth,
  insertEvents,
  updateDailyAggregations,
  updateHourlyAggregations,
  updateErrorSummary,
  updateAggregations,
  closeDatabaseConnection,
} from '../../src/database/index.js';
import { runMigrations, getSchemaVersion } from '../../src/database/migrations.js';
import type { AnalyticsEvent, StandardEvent } from '../../src/types/events.js';

describe('Database Integration Tests', () => {
  beforeAll(async () => {
    // Run migrations before tests
    await runMigrations(pool);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('TRUNCATE TABLE events, daily_aggregations, hourly_aggregations, error_summary');
    // Note: We don't close the pool here as it's shared
  });

  describe('Database Health', () => {
    it('should connect to database successfully', async () => {
      const isHealthy = await checkDatabaseHealth();
      expect(isHealthy).toBe(true);
    });

    it('should have correct schema version', async () => {
      const version = await getSchemaVersion(pool);
      expect(version).toBeGreaterThanOrEqual(1);
    });

    it('should have all required tables', async () => {
      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('events', 'daily_aggregations', 'hourly_aggregations', 'error_summary', 'schema_migrations')
        ORDER BY table_name
      `);

      const tables = result.rows.map((r) => r.table_name);
      expect(tables).toContain('events');
      expect(tables).toContain('daily_aggregations');
      expect(tables).toContain('hourly_aggregations');
      expect(tables).toContain('error_summary');
      expect(tables).toContain('schema_migrations');
    });
  });

  describe('Event Insertion', () => {
    it('should insert minimal events successfully', async () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      await expect(insertEvents(events)).resolves.not.toThrow();

      // Verify insertion
      const result = await pool.query('SELECT COUNT(*) as count FROM events WHERE tool = $1', [
        'get_forecast',
      ]);
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1);
    });

    it('should insert standard events with metrics', async () => {
      const events: StandardEvent[] = [
        {
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
        },
      ];

      await expect(insertEvents(events)).resolves.not.toThrow();

      // Verify all fields were inserted
      const result = await pool.query(
        'SELECT * FROM events WHERE tool = $1 AND timestamp_hour = $2',
        ['get_current_conditions', '2025-11-11T15:00:00Z']
      );

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const row = result.rows[0];
      expect(row.response_time_ms).toBe(150);
      expect(row.service).toBe('noaa');
      expect(row.cache_hit).toBe(true);
      expect(row.country).toBe('US');
    });

    it('should insert error events', async () => {
      const events: StandardEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_alerts',
          status: 'error',
          timestamp_hour: '2025-11-11T16:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
          response_time_ms: 5000,
          service: 'noaa',
        },
      ];

      await expect(insertEvents(events)).resolves.not.toThrow();

      // Verify error was inserted
      const result = await pool.query('SELECT * FROM events WHERE status = $1 AND error_type = $2', [
        'error',
        'ServiceUnavailableError',
      ]);

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows[0].error_type).toBe('ServiceUnavailableError');
    });

    it('should handle batch inserts', async () => {
      const events: AnalyticsEvent[] = Array.from({ length: 10 }, (_, i) => ({
        version: '1.0.0',
        tool: 'batch_test',
        status: 'success',
        timestamp_hour: '2025-11-11T17:00:00Z',
        analytics_level: 'minimal',
      }));

      await expect(insertEvents(events)).resolves.not.toThrow();

      const result = await pool.query('SELECT COUNT(*) as count FROM events WHERE tool = $1', [
        'batch_test',
      ]);
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(10);
    });

    it('should handle empty event array', async () => {
      await expect(insertEvents([])).resolves.not.toThrow();
    });
  });

  describe('Daily Aggregations', () => {
    it('should create daily aggregations from events', async () => {
      const events: StandardEvent[] = [
        {
          version: '1.0.0',
          tool: 'agg_test_daily',
          status: 'success',
          timestamp_hour: '2025-11-11T18:00:00Z',
          analytics_level: 'standard',
          response_time_ms: 100,
          service: 'noaa',
          cache_hit: true,
        },
        {
          version: '1.0.0',
          tool: 'agg_test_daily',
          status: 'success',
          timestamp_hour: '2025-11-11T18:00:00Z',
          analytics_level: 'standard',
          response_time_ms: 200,
          service: 'openmeteo',
          cache_hit: false,
        },
      ];

      await insertEvents(events);
      await expect(updateDailyAggregations(events)).resolves.not.toThrow();

      // Verify aggregation was created
      const result = await pool.query(
        'SELECT * FROM daily_aggregations WHERE tool = $1 AND date = $2',
        ['agg_test_daily', '2025-11-11']
      );

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const agg = result.rows[0];
      expect(agg.total_calls).toBeGreaterThanOrEqual(2);
      expect(agg.success_calls).toBeGreaterThanOrEqual(2);
      expect(agg.noaa_calls).toBeGreaterThanOrEqual(1);
      expect(agg.openmeteo_calls).toBeGreaterThanOrEqual(1);
    });

    it('should update existing aggregations', async () => {
      const tool = 'agg_update_test';
      const date = '2025-11-11';

      // First batch
      const events1: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool,
          status: 'success',
          timestamp_hour: '2025-11-11T19:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      await insertEvents(events1);
      await updateDailyAggregations(events1);

      // Second batch
      const events2: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool,
          status: 'success',
          timestamp_hour: '2025-11-11T19:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      await insertEvents(events2);
      await updateDailyAggregations(events2);

      // Verify count was updated
      const result = await pool.query(
        'SELECT * FROM daily_aggregations WHERE tool = $1 AND date = $2',
        [tool, date]
      );

      expect(result.rows.length).toBe(1); // Should be one record
      expect(result.rows[0].total_calls).toBeGreaterThanOrEqual(2); // Should accumulate
    });
  });

  describe('Hourly Aggregations', () => {
    it('should create hourly aggregations from events', async () => {
      const events: StandardEvent[] = [
        {
          version: '1.0.0',
          tool: 'hourly_test',
          status: 'success',
          timestamp_hour: '2025-11-11T20:00:00Z',
          analytics_level: 'standard',
          response_time_ms: 150,
        },
        {
          version: '1.0.0',
          tool: 'hourly_test',
          status: 'error',
          timestamp_hour: '2025-11-11T20:00:00Z',
          analytics_level: 'standard',
          error_type: 'TimeoutError',
        },
      ];

      await insertEvents(events);
      await expect(updateHourlyAggregations(events)).resolves.not.toThrow();

      // Verify aggregation
      const result = await pool.query(
        'SELECT * FROM hourly_aggregations WHERE tool = $1 AND hour = $2',
        ['hourly_test', '2025-11-11T20:00:00Z']
      );

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const agg = result.rows[0];
      expect(agg.total_calls).toBeGreaterThanOrEqual(2);
      expect(agg.success_calls).toBeGreaterThanOrEqual(1);
      expect(agg.error_calls).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Summary', () => {
    it('should create error summaries from error events', async () => {
      const events: StandardEvent[] = [
        {
          version: '1.0.0',
          tool: 'error_test',
          status: 'error',
          timestamp_hour: '2025-11-11T21:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
        },
        {
          version: '1.0.1',
          tool: 'error_test',
          status: 'error',
          timestamp_hour: '2025-11-11T21:00:00Z',
          analytics_level: 'standard',
          error_type: 'ServiceUnavailableError',
        },
      ];

      await insertEvents(events);
      await expect(updateErrorSummary(events)).resolves.not.toThrow();

      // Verify error summary
      const result = await pool.query(
        'SELECT * FROM error_summary WHERE tool = $1 AND error_type = $2',
        ['error_test', 'ServiceUnavailableError']
      );

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const summary = result.rows[0];
      expect(summary.count).toBeGreaterThanOrEqual(2);
      expect(summary.affected_versions).toContain('1.0.0');
      expect(summary.affected_versions).toContain('1.0.1');
    });

    it('should not create summaries for success events', async () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'success_only',
          status: 'success',
          timestamp_hour: '2025-11-11T22:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      await insertEvents(events);
      await expect(updateErrorSummary(events)).resolves.not.toThrow();

      // Should not create error summary
      const result = await pool.query('SELECT * FROM error_summary WHERE tool = $1', [
        'success_only',
      ]);

      expect(result.rows.length).toBe(0);
    });
  });

  describe('Combined Aggregations', () => {
    it('should update all aggregations at once', async () => {
      const events: StandardEvent[] = [
        {
          version: '1.0.0',
          tool: 'combined_test',
          status: 'success',
          timestamp_hour: '2025-11-11T23:00:00Z',
          analytics_level: 'standard',
          response_time_ms: 100,
        },
        {
          version: '1.0.0',
          tool: 'combined_test',
          status: 'error',
          timestamp_hour: '2025-11-11T23:00:00Z',
          analytics_level: 'standard',
          error_type: 'NetworkError',
        },
      ];

      await insertEvents(events);
      await expect(updateAggregations(events)).resolves.not.toThrow();

      // Verify all aggregations were updated
      const daily = await pool.query(
        'SELECT * FROM daily_aggregations WHERE tool = $1 AND date = $2',
        ['combined_test', '2025-11-11']
      );
      expect(daily.rows.length).toBeGreaterThanOrEqual(1);

      const hourly = await pool.query(
        'SELECT * FROM hourly_aggregations WHERE tool = $1 AND hour = $2',
        ['combined_test', '2025-11-11T23:00:00Z']
      );
      expect(hourly.rows.length).toBeGreaterThanOrEqual(1);

      const errors = await pool.query('SELECT * FROM error_summary WHERE tool = $1', [
        'combined_test',
      ]);
      expect(errors.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Migration System', () => {
    it('should track executed migrations', async () => {
      const result = await pool.query('SELECT * FROM schema_migrations ORDER BY id');
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should not re-run executed migrations', async () => {
      // Running migrations again should be idempotent
      await expect(runMigrations(pool)).resolves.not.toThrow();
    });
  });
});
