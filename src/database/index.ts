import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config.js';
import { dbLogger as logger } from '../utils/logger.js';
import type { EventRecord, AnalyticsEvent } from '../types/events.js';

// Create connection pool
export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: config.database.max,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: 5000,
  // Enable keepalive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Pool event listeners
pool.on('connect', (client) => {
  logger.debug('New database client connected');
});

pool.on('error', (err, client) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});

pool.on('remove', (client) => {
  logger.debug('Database client removed from pool');
});

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    logger.debug({ time: result.rows[0].time }, 'Database health check passed');
    return true;
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return false;
  }
}

// Get database stats
export async function getDatabaseStats(): Promise<{
  total_connections: number;
  idle_connections: number;
  waiting_count: number;
}> {
  return {
    total_connections: pool.totalCount,
    idle_connections: pool.idleCount,
    waiting_count: pool.waitingCount,
  };
}

// Insert events into the database
export async function insertEvents(events: AnalyticsEvent[]): Promise<void> {
  if (events.length === 0) {
    logger.warn('insertEvents called with empty array');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertPromises = events.map((event) => {
      return client.query(
        `INSERT INTO events (
          timestamp_hour, version, tool, status, analytics_level,
          response_time_ms, service, cache_hit, retry_count, country,
          parameters, session_id, sequence_number, error_type
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )`,
        [
          event.timestamp_hour,
          event.version,
          event.tool,
          event.status,
          event.analytics_level,
          'response_time_ms' in event ? event.response_time_ms ?? null : null,
          'service' in event ? event.service ?? null : null,
          'cache_hit' in event ? event.cache_hit ?? null : null,
          'retry_count' in event ? event.retry_count ?? null : null,
          'country' in event ? event.country ?? null : null,
          'parameters' in event ? JSON.stringify(event.parameters) ?? null : null,
          'session_id' in event ? event.session_id ?? null : null,
          'sequence_number' in event ? event.sequence_number ?? null : null,
          'error_type' in event ? event.error_type ?? null : null,
        ]
      );
    });

    await Promise.all(insertPromises);
    await client.query('COMMIT');

    logger.info({ count: events.length }, 'Events inserted successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error, count: events.length }, 'Failed to insert events');
    throw error;
  } finally {
    client.release();
  }
}

// Update daily aggregations (placeholder - will be implemented in Phase 3)
export async function updateDailyAggregations(events: AnalyticsEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  // Group events by date, tool, version, country
  const aggregations = new Map<string, {
    date: string;
    tool: string;
    version: string;
    country: string;
    events: AnalyticsEvent[];
  }>();

  for (const event of events) {
    const date = new Date(event.timestamp_hour).toISOString().split('T')[0];
    const version = event.version;
    const country = 'country' in event && event.country ? event.country : '';
    const key = `${date}:${event.tool}:${version}:${country}`;

    if (!aggregations.has(key)) {
      aggregations.set(key, {
        date,
        tool: event.tool,
        version,
        country,
        events: [],
      });
    }

    aggregations.get(key)!.events.push(event);
  }

  // Insert/update aggregations
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const agg of aggregations.values()) {
      const totalCalls = agg.events.length;
      const successCalls = agg.events.filter((e) => e.status === 'success').length;
      const errorCalls = agg.events.filter((e) => e.status === 'error').length;

      // Calculate response time metrics (only for events with response_time_ms)
      const responseTimes = agg.events
        .filter((e): e is StandardEvent => 'response_time_ms' in e && e.response_time_ms !== undefined)
        .map((e) => e.response_time_ms!);

      const avgResponseTime =
        responseTimes.length > 0
          ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
          : null;

      // Calculate cache metrics
      const cacheEvents = agg.events.filter(
        (e): e is StandardEvent => 'cache_hit' in e && e.cache_hit !== undefined
      );
      const cacheHits = cacheEvents.filter((e) => e.cache_hit === true).length;
      const cacheMisses = cacheEvents.filter((e) => e.cache_hit === false).length;
      const cacheHitRate = cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : null;

      // Calculate service distribution
      const noaaCalls = agg.events.filter(
        (e): e is StandardEvent => 'service' in e && e.service === 'noaa'
      ).length;
      const openmeoCalls = agg.events.filter(
        (e): e is StandardEvent => 'service' in e && e.service === 'openmeteo'
      ).length;

      // Upsert into daily_aggregations
      await client.query(
        `INSERT INTO daily_aggregations (
          date, tool, version, country,
          total_calls, success_calls, error_calls,
          avg_response_time_ms, cache_hit_count, cache_miss_count, cache_hit_rate,
          noaa_calls, openmeteo_calls
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (date, tool, version, country)
        DO UPDATE SET
          total_calls = daily_aggregations.total_calls + EXCLUDED.total_calls,
          success_calls = daily_aggregations.success_calls + EXCLUDED.success_calls,
          error_calls = daily_aggregations.error_calls + EXCLUDED.error_calls,
          avg_response_time_ms = CASE
            WHEN EXCLUDED.avg_response_time_ms IS NOT NULL THEN
              (COALESCE(daily_aggregations.avg_response_time_ms, 0) * daily_aggregations.total_calls +
               EXCLUDED.avg_response_time_ms * EXCLUDED.total_calls) /
              (daily_aggregations.total_calls + EXCLUDED.total_calls)
            ELSE daily_aggregations.avg_response_time_ms
          END,
          cache_hit_count = daily_aggregations.cache_hit_count + EXCLUDED.cache_hit_count,
          cache_miss_count = daily_aggregations.cache_miss_count + EXCLUDED.cache_miss_count,
          cache_hit_rate = CASE
            WHEN (daily_aggregations.cache_hit_count + daily_aggregations.cache_miss_count +
                  EXCLUDED.cache_hit_count + EXCLUDED.cache_miss_count) > 0 THEN
              (daily_aggregations.cache_hit_count + EXCLUDED.cache_hit_count)::REAL /
              (daily_aggregations.cache_hit_count + daily_aggregations.cache_miss_count +
               EXCLUDED.cache_hit_count + EXCLUDED.cache_miss_count)::REAL
            ELSE NULL
          END,
          noaa_calls = daily_aggregations.noaa_calls + EXCLUDED.noaa_calls,
          openmeteo_calls = daily_aggregations.openmeteo_calls + EXCLUDED.openmeteo_calls,
          updated_at = NOW()`,
        [
          agg.date,
          agg.tool,
          agg.version,
          agg.country,
          totalCalls,
          successCalls,
          errorCalls,
          avgResponseTime,
          cacheHits,
          cacheMisses,
          cacheHitRate,
          noaaCalls,
          openmeoCalls,
        ]
      );
    }

    await client.query('COMMIT');
    logger.info({ aggregations: aggregations.size }, 'Daily aggregations updated');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error }, 'Failed to update daily aggregations');
    throw error;
  } finally {
    client.release();
  }
}

// Update hourly aggregations
export async function updateHourlyAggregations(events: AnalyticsEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  // Group events by hour, tool, version
  const aggregations = new Map<string, {
    hour: string;
    tool: string;
    version: string;
    events: AnalyticsEvent[];
  }>();

  for (const event of events) {
    const hour = new Date(event.timestamp_hour).toISOString();
    const version = event.version;
    const key = `${hour}:${event.tool}:${version}`;

    if (!aggregations.has(key)) {
      aggregations.set(key, {
        hour,
        tool: event.tool,
        version,
        events: [],
      });
    }

    aggregations.get(key)!.events.push(event);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const agg of aggregations.values()) {
      const totalCalls = agg.events.length;
      const successCalls = agg.events.filter((e) => e.status === 'success').length;
      const errorCalls = agg.events.filter((e) => e.status === 'error').length;

      // Calculate response time metrics
      const responseTimes = agg.events
        .filter((e): e is StandardEvent => 'response_time_ms' in e && e.response_time_ms !== undefined)
        .map((e) => e.response_time_ms!);

      const avgResponseTime =
        responseTimes.length > 0
          ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
          : null;

      // Calculate p95
      const p95ResponseTime = responseTimes.length > 0
        ? calculatePercentile(responseTimes, 95)
        : null;

      // Calculate cache hit rate
      const cacheEvents = agg.events.filter(
        (e): e is StandardEvent => 'cache_hit' in e && e.cache_hit !== undefined
      );
      const cacheHits = cacheEvents.filter((e) => e.cache_hit === true).length;
      const cacheMisses = cacheEvents.filter((e) => e.cache_hit === false).length;
      const cacheHitRate = cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : null;

      // Upsert into hourly_aggregations
      await client.query(
        `INSERT INTO hourly_aggregations (
          hour, tool, version,
          total_calls, success_calls, error_calls,
          avg_response_time_ms, p95_response_time_ms, cache_hit_rate
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT (hour, tool, version)
        DO UPDATE SET
          total_calls = hourly_aggregations.total_calls + EXCLUDED.total_calls,
          success_calls = hourly_aggregations.success_calls + EXCLUDED.success_calls,
          error_calls = hourly_aggregations.error_calls + EXCLUDED.error_calls,
          avg_response_time_ms = CASE
            WHEN EXCLUDED.avg_response_time_ms IS NOT NULL THEN
              (COALESCE(hourly_aggregations.avg_response_time_ms, 0) * hourly_aggregations.total_calls +
               EXCLUDED.avg_response_time_ms * EXCLUDED.total_calls) /
              (hourly_aggregations.total_calls + EXCLUDED.total_calls)
            ELSE hourly_aggregations.avg_response_time_ms
          END,
          p95_response_time_ms = EXCLUDED.p95_response_time_ms,
          cache_hit_rate = EXCLUDED.cache_hit_rate,
          updated_at = NOW()`,
        [agg.hour, agg.tool, agg.version, totalCalls, successCalls, errorCalls, avgResponseTime, p95ResponseTime, cacheHitRate]
      );
    }

    await client.query('COMMIT');
    logger.info({ aggregations: aggregations.size }, 'Hourly aggregations updated');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error }, 'Failed to update hourly aggregations');
    throw error;
  } finally {
    client.release();
  }
}

// Update error summary
export async function updateErrorSummary(events: AnalyticsEvent[]): Promise<void> {
  // Filter only error events
  const errorEvents = events.filter((e) => e.status === 'error' && 'error_type' in e && e.error_type);

  if (errorEvents.length === 0) {
    return;
  }

  // Group by hour, tool, error_type
  const summaries = new Map<string, {
    hour: string;
    tool: string;
    error_type: string;
    events: AnalyticsEvent[];
  }>();

  for (const event of errorEvents) {
    const hour = new Date(event.timestamp_hour).toISOString();
    const errorType = 'error_type' in event ? event.error_type! : 'UnknownError';
    const key = `${hour}:${event.tool}:${errorType}`;

    if (!summaries.has(key)) {
      summaries.set(key, {
        hour,
        tool: event.tool,
        error_type: errorType,
        events: [],
      });
    }

    summaries.get(key)!.events.push(event);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const summary of summaries.values()) {
      const count = summary.events.length;
      const versions = [...new Set(summary.events.map((e) => e.version))];
      const now = new Date();

      // Upsert into error_summary
      await client.query(
        `INSERT INTO error_summary (
          hour, tool, error_type, count, first_seen, last_seen, affected_versions
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (hour, tool, error_type)
        DO UPDATE SET
          count = error_summary.count + EXCLUDED.count,
          last_seen = EXCLUDED.last_seen,
          affected_versions = array(
            SELECT DISTINCT unnest(error_summary.affected_versions || EXCLUDED.affected_versions)
          ),
          updated_at = NOW()`,
        [summary.hour, summary.tool, summary.error_type, count, now, now, versions]
      );
    }

    await client.query('COMMIT');
    logger.info({ summaries: summaries.size }, 'Error summaries updated');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error }, 'Failed to update error summaries');
    throw error;
  } finally {
    client.release();
  }
}

// Update all aggregations (convenience function)
export async function updateAggregations(events: AnalyticsEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  try {
    await Promise.all([
      updateDailyAggregations(events),
      updateHourlyAggregations(events),
      updateErrorSummary(events),
    ]);
    logger.debug({ count: events.length }, 'All aggregations updated');
  } catch (error) {
    logger.error({ error }, 'Failed to update aggregations');
    throw error;
  }
}

// Helper function to calculate percentile
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error({ error }, 'Error closing database connection pool');
    throw error;
  }
}

// Type guard for StandardEvent
type StandardEvent = Extract<AnalyticsEvent, { analytics_level: 'standard' }> |
  Extract<AnalyticsEvent, { analytics_level: 'detailed' }>;
