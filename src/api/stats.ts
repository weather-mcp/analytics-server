import { pool } from '../database/index.js';
import { redis } from '../queue/index.js';
import { apiLogger as logger } from '../utils/logger.js';
import type { StatsOverview, ToolStats, ErrorStats } from '../types/events.js';

// Cache configuration
const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_PREFIX = 'stats:';

/**
 * Get cached value or compute if missing
 */
async function getCached<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttl: number = CACHE_TTL_SECONDS
): Promise<T> {
  try {
    // Try to get from cache
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);
    if (cached) {
      logger.debug({ key }, 'Cache hit');
      return JSON.parse(cached) as T;
    }

    // Cache miss - compute value
    logger.debug({ key }, 'Cache miss');
    const value = await computeFn();

    // Store in cache (fire and forget - don't wait)
    redis.setex(`${CACHE_PREFIX}${key}`, ttl, JSON.stringify(value)).catch((err) => {
      logger.error({ error: err, key }, 'Failed to cache value');
    });

    return value;
  } catch (error) {
    // If cache fails, just compute the value
    logger.warn({ error, key }, 'Cache error, computing without cache');
    return await computeFn();
  }
}

/**
 * Parse time period (7d, 30d, 90d) into days
 */
function parsePeriod(period: string): number {
  const match = period.match(/^(\d+)d$/);
  if (!match) {
    throw new Error('Invalid period format. Use: 7d, 30d, or 90d');
  }
  const days = parseInt(match[1], 10);
  if (![7, 30, 90].includes(days)) {
    throw new Error('Period must be one of: 7d, 30d, 90d');
  }
  return days;
}

/**
 * Get overview statistics
 */
export async function getStatsOverview(period: string = '30d'): Promise<StatsOverview> {
  const cacheKey = `overview:${period}`;

  return getCached(cacheKey, async () => {
    const days = parsePeriod(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    // Query aggregated statistics
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT tool) as tool_count,
        COUNT(DISTINCT version) as version_count,
        SUM(total_calls) as total_calls,
        SUM(success_calls) as success_calls,
        SUM(error_calls) as error_calls,
        AVG(avg_response_time_ms) as avg_response_time,
        SUM(cache_hit_count) as cache_hits,
        SUM(cache_miss_count) as cache_misses
      FROM daily_aggregations
      WHERE date >= $1 AND date <= $2
    `;

    const summaryResult = await pool.query(summaryQuery, [startDate, endDate]);
    const summary = summaryResult.rows[0];

    const totalCalls = parseInt(summary.total_calls || '0', 10);
    const successCalls = parseInt(summary.success_calls || '0', 10);
    const cacheHits = parseInt(summary.cache_hits || '0', 10);
    const cacheMisses = parseInt(summary.cache_misses || '0', 10);

    const successRate = totalCalls > 0 ? successCalls / totalCalls : 0;
    const cacheHitRate = (cacheHits + cacheMisses) > 0 ? cacheHits / (cacheHits + cacheMisses) : 0;

    // Get per-tool statistics
    const toolsQuery = `
      SELECT
        tool,
        SUM(total_calls) as calls,
        SUM(success_calls) as success_calls,
        AVG(avg_response_time_ms) as avg_response_time
      FROM daily_aggregations
      WHERE date >= $1 AND date <= $2
      GROUP BY tool
      ORDER BY calls DESC
      LIMIT 20
    `;

    const toolsResult = await pool.query(toolsQuery, [startDate, endDate]);
    const tools: ToolStats[] = toolsResult.rows.map((row) => {
      const calls = parseInt(row.calls, 10);
      const successCalls = parseInt(row.success_calls, 10);
      return {
        name: row.tool,
        calls,
        success_rate: calls > 0 ? successCalls / calls : 0,
        avg_response_time_ms: parseFloat(row.avg_response_time) || 0,
      };
    });

    // Get error statistics
    const errorsQuery = `
      SELECT
        error_type,
        SUM(count) as total_count,
        MAX(last_seen) as last_seen
      FROM error_summary
      WHERE hour >= $1 AND hour <= $2
      GROUP BY error_type
      ORDER BY total_count DESC
      LIMIT 10
    `;

    const errorsResult = await pool.query(errorsQuery, [startDate, endDate]);
    const totalErrors = errorsResult.rows.reduce((sum, row) => sum + parseInt(row.total_count, 10), 0);
    const errors: ErrorStats[] = errorsResult.rows.map((row) => {
      const count = parseInt(row.total_count, 10);
      return {
        type: row.error_type,
        count,
        percentage: totalErrors > 0 ? count / totalErrors : 0,
        last_seen: row.last_seen?.toISOString(),
      };
    });

    // Estimate active installs (very rough: unique versions * some multiplier)
    // This is a placeholder - in reality would need session tracking
    const estimatedInstalls = Math.max(
      parseInt(summary.version_count || '0', 10) * 2,
      Math.ceil(totalCalls / (days * 10)) // Assume 10 calls per install per day
    );

    return {
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      summary: {
        total_calls: totalCalls,
        unique_versions: parseInt(summary.version_count || '0', 10),
        active_installs: estimatedInstalls,
        success_rate: successRate,
        avg_response_time_ms: parseFloat(summary.avg_response_time) || 0,
      },
      tools,
      errors,
      cache_hit_rate: cacheHitRate,
    };
  });
}

/**
 * Get statistics for all tools
 */
export async function getToolsStats(period: string = '30d'): Promise<ToolStats[]> {
  const cacheKey = `tools:${period}`;

  return getCached(cacheKey, async () => {
    const days = parsePeriod(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const query = `
      SELECT
        tool,
        SUM(total_calls) as calls,
        SUM(success_calls) as success_calls,
        SUM(error_calls) as error_calls,
        AVG(avg_response_time_ms) as avg_response_time
      FROM daily_aggregations
      WHERE date >= $1 AND date <= $2
      GROUP BY tool
      ORDER BY calls DESC
    `;

    const result = await pool.query(query, [startDate, endDate]);

    return result.rows.map((row) => {
      const calls = parseInt(row.calls, 10);
      const successCalls = parseInt(row.success_calls, 10);
      return {
        name: row.tool,
        calls,
        success_rate: calls > 0 ? successCalls / calls : 0,
        avg_response_time_ms: parseFloat(row.avg_response_time) || 0,
      };
    });
  });
}

/**
 * Get statistics for a specific tool
 */
export async function getToolStats(toolName: string, period: string = '30d'): Promise<{
  tool: string;
  period: string;
  summary: ToolStats;
  daily_data: Array<{
    date: string;
    calls: number;
    success_rate: number;
    avg_response_time_ms: number;
  }>;
  versions: Array<{
    version: string;
    calls: number;
    percentage: number;
  }>;
  countries: Array<{
    country: string;
    calls: number;
    percentage: number;
  }>;
} | null> {
  const cacheKey = `tool:${toolName}:${period}`;

  return getCached(cacheKey, async () => {
    const days = parsePeriod(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    // Get overall stats for this tool
    const summaryQuery = `
      SELECT
        SUM(total_calls) as calls,
        SUM(success_calls) as success_calls,
        AVG(avg_response_time_ms) as avg_response_time
      FROM daily_aggregations
      WHERE date >= $1 AND date <= $2 AND tool = $3
    `;

    const summaryResult = await pool.query(summaryQuery, [startDate, endDate, toolName]);
    if (summaryResult.rows.length === 0 || !summaryResult.rows[0].calls) {
      return null; // Tool not found
    }

    const summary = summaryResult.rows[0];
    const calls = parseInt(summary.calls, 10);
    const successCalls = parseInt(summary.success_calls, 10);

    // Get daily breakdown
    const dailyQuery = `
      SELECT
        date,
        SUM(total_calls) as calls,
        SUM(success_calls) as success_calls,
        AVG(avg_response_time_ms) as avg_response_time
      FROM daily_aggregations
      WHERE date >= $1 AND date <= $2 AND tool = $3
      GROUP BY date
      ORDER BY date ASC
    `;

    const dailyResult = await pool.query(dailyQuery, [startDate, endDate, toolName]);
    const dailyData = dailyResult.rows.map((row) => {
      const dayCalls = parseInt(row.calls, 10);
      const daySuccessCalls = parseInt(row.success_calls, 10);
      return {
        date: row.date.toISOString().split('T')[0],
        calls: dayCalls,
        success_rate: dayCalls > 0 ? daySuccessCalls / dayCalls : 0,
        avg_response_time_ms: parseFloat(row.avg_response_time) || 0,
      };
    });

    // Get version distribution
    const versionsQuery = `
      SELECT
        version,
        SUM(total_calls) as calls
      FROM daily_aggregations
      WHERE date >= $1 AND date <= $2 AND tool = $3
      GROUP BY version
      ORDER BY calls DESC
      LIMIT 10
    `;

    const versionsResult = await pool.query(versionsQuery, [startDate, endDate, toolName]);
    const versions = versionsResult.rows.map((row) => {
      const versionCalls = parseInt(row.calls, 10);
      return {
        version: row.version,
        calls: versionCalls,
        percentage: calls > 0 ? versionCalls / calls : 0,
      };
    });

    // Get country distribution (excluding empty country)
    const countriesQuery = `
      SELECT
        country,
        SUM(total_calls) as calls
      FROM daily_aggregations
      WHERE date >= $1 AND date <= $2 AND tool = $3 AND country != ''
      GROUP BY country
      ORDER BY calls DESC
      LIMIT 20
    `;

    const countriesResult = await pool.query(countriesQuery, [startDate, endDate, toolName]);
    const countries = countriesResult.rows.map((row) => {
      const countryCalls = parseInt(row.calls, 10);
      return {
        country: row.country,
        calls: countryCalls,
        percentage: calls > 0 ? countryCalls / calls : 0,
      };
    });

    return {
      tool: toolName,
      period,
      summary: {
        name: toolName,
        calls,
        success_rate: calls > 0 ? successCalls / calls : 0,
        avg_response_time_ms: parseFloat(summary.avg_response_time) || 0,
      },
      daily_data: dailyData,
      versions,
      countries,
    };
  });
}

/**
 * Get error statistics
 */
export async function getErrorStats(period: string = '30d'): Promise<ErrorStats[]> {
  const cacheKey = `errors:${period}`;

  return getCached(cacheKey, async () => {
    const days = parsePeriod(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const query = `
      SELECT
        error_type,
        SUM(count) as total_count,
        MAX(last_seen) as last_seen
      FROM error_summary
      WHERE hour >= $1 AND hour <= $2
      GROUP BY error_type
      ORDER BY total_count DESC
      LIMIT 20
    `;

    const result = await pool.query(query, [startDate, endDate]);
    const totalErrors = result.rows.reduce((sum, row) => sum + parseInt(row.total_count, 10), 0);

    return result.rows.map((row) => {
      const count = parseInt(row.total_count, 10);
      return {
        type: row.error_type,
        count,
        percentage: totalErrors > 0 ? count / totalErrors : 0,
        last_seen: row.last_seen?.toISOString(),
      };
    });
  });
}

/**
 * Get performance statistics
 */
export async function getPerformanceStats(period: string = '30d'): Promise<{
  period: string;
  response_times: {
    avg_ms: number;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
  };
  cache_performance: {
    hit_rate: number;
    total_hits: number;
    total_misses: number;
  };
  service_distribution: {
    noaa: number;
    openmeteo: number;
  };
}> {
  const cacheKey = `performance:${period}`;

  return getCached(cacheKey, async () => {
    const days = parsePeriod(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const query = `
      SELECT
        AVG(avg_response_time_ms) as avg_response_time,
        AVG(p50_response_time_ms) as p50_response_time,
        AVG(p95_response_time_ms) as p95_response_time,
        AVG(p99_response_time_ms) as p99_response_time,
        SUM(cache_hit_count) as cache_hits,
        SUM(cache_miss_count) as cache_misses,
        SUM(noaa_calls) as noaa_calls,
        SUM(openmeteo_calls) as openmeteo_calls
      FROM daily_aggregations
      WHERE date >= $1 AND date <= $2
    `;

    const result = await pool.query(query, [startDate, endDate]);
    const row = result.rows[0];

    const cacheHits = parseInt(row.cache_hits || '0', 10);
    const cacheMisses = parseInt(row.cache_misses || '0', 10);
    const noaaCalls = parseInt(row.noaa_calls || '0', 10);
    const openmeoCalls = parseInt(row.openmeteo_calls || '0', 10);

    return {
      period,
      response_times: {
        avg_ms: parseFloat(row.avg_response_time) || 0,
        p50_ms: parseFloat(row.p50_response_time) || 0,
        p95_ms: parseFloat(row.p95_response_time) || 0,
        p99_ms: parseFloat(row.p99_response_time) || 0,
      },
      cache_performance: {
        hit_rate: (cacheHits + cacheMisses) > 0 ? cacheHits / (cacheHits + cacheMisses) : 0,
        total_hits: cacheHits,
        total_misses: cacheMisses,
      },
      service_distribution: {
        noaa: noaaCalls,
        openmeteo: openmeoCalls,
      },
    };
  });
}
