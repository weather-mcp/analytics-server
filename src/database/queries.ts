import { pool } from './index.js';
import { dbLogger as logger } from '../utils/logger.js';

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface OverviewStats {
  period: string;
  start_date: string;
  end_date: string;
  summary: {
    total_calls: number;
    unique_versions: number;
    active_installs: number;
    success_rate: number;
    avg_response_time_ms: number;
  };
  tools: ToolSummary[];
  errors: ErrorSummary[];
  cache_hit_rate: number;
}

export interface ToolSummary {
  name: string;
  calls: number;
  success_rate: number;
  avg_response_time_ms: number;
}

export interface ErrorSummary {
  type: string;
  count: number;
  percentage: number;
  affected_tools: string[];
}

export interface ToolUsageData {
  timestamp: string;
  [toolName: string]: number | string;
}

export interface PerformanceMetrics {
  by_tool: {
    [toolName: string]: {
      p50: number;
      p95: number;
      p99: number;
      avg: number;
    };
  };
  timeline: {
    timestamp: string;
    p50: number;
    p95: number;
    p99: number;
  }[];
}

export interface CacheStats {
  hit_rate: number;
  total_requests: number;
  cache_hits: number;
  cache_misses: number;
  saved_requests: number;
  by_tool: {
    [toolName: string]: {
      hit_rate: number;
      hits: number;
      misses: number;
    };
  };
}

export interface ServiceDistribution {
  noaa: {
    calls: number;
    percentage: number;
    success_rate: number;
  };
  openMeteo: {
    calls: number;
    percentage: number;
    success_rate: number;
  };
}

export interface GeoDistribution {
  countries: {
    code: string;
    name: string;
    calls: number;
    percentage: number;
  }[];
}

export interface AnalyticsData {
  overview: OverviewStats;
  toolUsage: ToolUsageData[];
  performance: PerformanceMetrics;
  errors: ErrorSummary[];
  cache: CacheStats;
  services: ServiceDistribution;
  geo: GeoDistribution;
}

/**
 * Parse period string to date range
 * Supports: 1h, 6h, 12h, 24h, 7d, 30d, 90d
 */
export function parsePeriod(period: string): PeriodRange {
  const now = new Date();
  const start = new Date(now);

  const match = period.match(/^(\d+)([hd])$/);
  if (!match) {
    throw new Error(`Invalid period format: ${period}. Expected format: <number><h|d> (e.g., 24h, 7d)`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 'h') {
    start.setHours(start.getHours() - value);
  } else if (unit === 'd') {
    start.setDate(start.getDate() - value);
  }

  return { start, end: now };
}

/**
 * Get overview statistics for a given period
 */
export async function getOverviewStats(period: string): Promise<OverviewStats> {
  try {
    const range = parsePeriod(period);

    // Query summary statistics from hourly aggregations
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT version) as unique_versions,
        SUM(total_calls) as total_calls,
        SUM(success_calls) as success_calls,
        SUM(error_calls) as error_calls,
        AVG(avg_response_time_ms) as avg_response_time_ms,
        AVG(cache_hit_rate) as avg_cache_hit_rate
      FROM hourly_aggregations
      WHERE hour >= $1 AND hour <= $2
    `;

    const summaryResult = await pool.query(summaryQuery, [range.start, range.end]);
    const summary = summaryResult.rows[0];

    const totalCalls = parseInt(summary.total_calls || '0', 10);
    const successCalls = parseInt(summary.success_calls || '0', 10);
    const successRate = totalCalls > 0 ? successCalls / totalCalls : 0;

    // Estimate active installs (unique versions is a proxy)
    const activeInstalls = parseInt(summary.unique_versions || '0', 10) * 5; // Rough estimate

    // Query tool summaries
    const toolsQuery = `
      SELECT
        tool as name,
        SUM(total_calls) as calls,
        SUM(success_calls) as success_calls,
        AVG(avg_response_time_ms) as avg_response_time_ms
      FROM hourly_aggregations
      WHERE hour >= $1 AND hour <= $2
      GROUP BY tool
      ORDER BY calls DESC
    `;

    const toolsResult = await pool.query(toolsQuery, [range.start, range.end]);
    const tools: ToolSummary[] = toolsResult.rows.map(row => ({
      name: row.name,
      calls: parseInt(row.calls, 10),
      success_rate: row.calls > 0 ? parseFloat(row.success_calls) / parseFloat(row.calls) : 0,
      avg_response_time_ms: parseFloat(row.avg_response_time_ms || '0'),
    }));

    // Query error summaries
    const errorsQuery = `
      SELECT
        error_type as type,
        SUM(count) as count,
        array_agg(DISTINCT tool) as tools
      FROM error_summary
      WHERE hour >= $1 AND hour <= $2
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 10
    `;

    const errorsResult = await pool.query(errorsQuery, [range.start, range.end]);
    const errors: ErrorSummary[] = errorsResult.rows.map(row => {
      const errorCount = parseInt(row.count, 10);
      return {
        type: row.type,
        count: errorCount,
        percentage: totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0,
        affected_tools: row.tools || [],
      };
    });

    return {
      period,
      start_date: range.start.toISOString(),
      end_date: range.end.toISOString(),
      summary: {
        total_calls: totalCalls,
        unique_versions: parseInt(summary.unique_versions || '0', 10),
        active_installs: activeInstalls,
        success_rate: successRate,
        avg_response_time_ms: parseFloat(summary.avg_response_time_ms || '0'),
      },
      tools,
      errors,
      cache_hit_rate: parseFloat(summary.avg_cache_hit_rate || '0'),
    };
  } catch (error) {
    logger.error({ error, period }, 'Failed to get overview stats');
    throw error;
  }
}

/**
 * Get tool usage timeline
 */
export async function getToolUsageData(period: string): Promise<ToolUsageData[]> {
  try {
    const range = parsePeriod(period);

    const query = `
      SELECT
        hour as timestamp,
        tool,
        SUM(total_calls) as calls
      FROM hourly_aggregations
      WHERE hour >= $1 AND hour <= $2
      GROUP BY hour, tool
      ORDER BY hour ASC
    `;

    const result = await pool.query(query, [range.start, range.end]);

    // Transform to timeline format
    const timelineMap = new Map<string, ToolUsageData>();

    for (const row of result.rows) {
      const timestamp = new Date(row.timestamp).toISOString();
      if (!timelineMap.has(timestamp)) {
        timelineMap.set(timestamp, { timestamp });
      }
      const entry = timelineMap.get(timestamp)!;
      entry[row.tool] = parseInt(row.calls, 10);
    }

    return Array.from(timelineMap.values());
  } catch (error) {
    logger.error({ error, period }, 'Failed to get tool usage data');
    throw error;
  }
}

/**
 * Get performance metrics
 */
export async function getPerformanceMetrics(period: string): Promise<PerformanceMetrics> {
  try {
    const range = parsePeriod(period);

    // Get by-tool metrics from daily aggregations
    const byToolQuery = `
      SELECT
        tool,
        AVG(avg_response_time_ms) as avg,
        AVG(p50_response_time_ms) as p50,
        AVG(p95_response_time_ms) as p95,
        AVG(p99_response_time_ms) as p99
      FROM daily_aggregations
      WHERE date >= $1::date AND date <= $2::date
      GROUP BY tool
    `;

    const byToolResult = await pool.query(byToolQuery, [range.start, range.end]);
    const by_tool: PerformanceMetrics['by_tool'] = {};

    for (const row of byToolResult.rows) {
      by_tool[row.tool] = {
        avg: parseFloat(row.avg || '0'),
        p50: parseFloat(row.p50 || '0'),
        p95: parseFloat(row.p95 || '0'),
        p99: parseFloat(row.p99 || '0'),
      };
    }

    // Get timeline from hourly aggregations
    const timelineQuery = `
      SELECT
        hour as timestamp,
        AVG(avg_response_time_ms) as avg,
        AVG(p95_response_time_ms) as p95
      FROM hourly_aggregations
      WHERE hour >= $1 AND hour <= $2
      GROUP BY hour
      ORDER BY hour ASC
    `;

    const timelineResult = await pool.query(timelineQuery, [range.start, range.end]);
    const timeline = timelineResult.rows.map(row => ({
      timestamp: new Date(row.timestamp).toISOString(),
      p50: parseFloat(row.avg || '0'), // Using avg as proxy for p50
      p95: parseFloat(row.p95 || '0'),
      p99: parseFloat(row.p95 || '0') * 1.2, // Rough estimate
    }));

    return { by_tool, timeline };
  } catch (error) {
    logger.error({ error, period }, 'Failed to get performance metrics');
    throw error;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(period: string): Promise<CacheStats> {
  try {
    const range = parsePeriod(period);

    // Get overall cache stats from daily aggregations
    const overallQuery = `
      SELECT
        SUM(total_calls) as total_requests,
        SUM(cache_hit_count) as cache_hits,
        SUM(cache_miss_count) as cache_misses
      FROM daily_aggregations
      WHERE date >= $1::date AND date <= $2::date
    `;

    const overallResult = await pool.query(overallQuery, [range.start, range.end]);
    const overall = overallResult.rows[0];

    const totalRequests = parseInt(overall.total_requests || '0', 10);
    const cacheHits = parseInt(overall.cache_hits || '0', 10);
    const cacheMisses = parseInt(overall.cache_misses || '0', 10);
    const hitRate = (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0;

    // Get by-tool cache stats
    const byToolQuery = `
      SELECT
        tool,
        SUM(cache_hit_count) as hits,
        SUM(cache_miss_count) as misses
      FROM daily_aggregations
      WHERE date >= $1::date AND date <= $2::date
      GROUP BY tool
    `;

    const byToolResult = await pool.query(byToolQuery, [range.start, range.end]);
    const by_tool: CacheStats['by_tool'] = {};

    for (const row of byToolResult.rows) {
      const hits = parseInt(row.hits || '0', 10);
      const misses = parseInt(row.misses || '0', 10);
      const toolHitRate = (hits + misses) > 0 ? (hits / (hits + misses)) * 100 : 0;

      by_tool[row.tool] = {
        hit_rate: toolHitRate,
        hits,
        misses,
      };
    }

    return {
      hit_rate: hitRate,
      total_requests: totalRequests,
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
      saved_requests: cacheHits,
      by_tool,
    };
  } catch (error) {
    logger.error({ error, period }, 'Failed to get cache stats');
    throw error;
  }
}

/**
 * Get service distribution
 */
export async function getServiceDistribution(period: string): Promise<ServiceDistribution> {
  try {
    const range = parsePeriod(period);

    const query = `
      SELECT
        SUM(noaa_calls) as noaa_calls,
        SUM(openmeteo_calls) as openmeteo_calls,
        SUM(total_calls) as total_calls,
        SUM(success_calls) as success_calls,
        SUM(error_calls) as error_calls
      FROM daily_aggregations
      WHERE date >= $1::date AND date <= $2::date
    `;

    const result = await pool.query(query, [range.start, range.end]);
    const row = result.rows[0];

    const noaaCalls = parseInt(row.noaa_calls || '0', 10);
    const openmeoCalls = parseInt(row.openmeteo_calls || '0', 10);
    const totalCalls = parseInt(row.total_calls || '0', 10);
    const successCalls = parseInt(row.success_calls || '0', 10);

    return {
      noaa: {
        calls: noaaCalls,
        percentage: totalCalls > 0 ? (noaaCalls / totalCalls) * 100 : 0,
        success_rate: noaaCalls > 0 ? successCalls / totalCalls : 0, // Simplified
      },
      openMeteo: {
        calls: openmeoCalls,
        percentage: totalCalls > 0 ? (openmeoCalls / totalCalls) * 100 : 0,
        success_rate: openmeoCalls > 0 ? successCalls / totalCalls : 0, // Simplified
      },
    };
  } catch (error) {
    logger.error({ error, period }, 'Failed to get service distribution');
    throw error;
  }
}

/**
 * Get geographic distribution
 */
export async function getGeoDistribution(period: string): Promise<GeoDistribution> {
  try {
    const range = parsePeriod(period);

    const query = `
      SELECT
        country as code,
        SUM(total_calls) as calls
      FROM daily_aggregations
      WHERE date >= $1::date AND date <= $2::date
        AND country IS NOT NULL
        AND country != ''
      GROUP BY country
      ORDER BY calls DESC
      LIMIT 20
    `;

    const result = await pool.query(query, [range.start, range.end]);

    const totalCalls = result.rows.reduce((sum, row) => sum + parseInt(row.calls, 10), 0);

    const countries = result.rows.map(row => ({
      code: row.code,
      name: row.code, // Would need a country code lookup for full names
      calls: parseInt(row.calls, 10),
      percentage: totalCalls > 0 ? (parseInt(row.calls, 10) / totalCalls) * 100 : 0,
    }));

    return { countries };
  } catch (error) {
    logger.error({ error, period }, 'Failed to get geo distribution');
    throw error;
  }
}

/**
 * Get complete analytics data
 */
export async function getAnalyticsData(period: string): Promise<AnalyticsData> {
  try {
    const [overview, toolUsage, performance, cache, services, geo] = await Promise.all([
      getOverviewStats(period),
      getToolUsageData(period),
      getPerformanceMetrics(period),
      getCacheStats(period),
      getServiceDistribution(period),
      getGeoDistribution(period),
    ]);

    return {
      overview,
      toolUsage,
      performance,
      errors: overview.errors,
      cache,
      services,
      geo,
    };
  } catch (error) {
    logger.error({ error, period }, 'Failed to get analytics data');
    throw error;
  }
}

/**
 * Get analytics health status
 */
export async function getAnalyticsHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'down';
  uptime_seconds: number;
  events_processed_24h: number;
  last_event_received: string;
}> {
  try {
    const query = `
      SELECT
        COUNT(*) as events_24h,
        MAX(timestamp) as last_event
      FROM events
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
    `;

    const result = await pool.query(query);
    const row = result.rows[0];

    const events24h = parseInt(row.events_24h || '0', 10);
    const lastEvent = row.last_event ? new Date(row.last_event).toISOString() : new Date().toISOString();

    // Determine status based on recent activity
    let status: 'healthy' | 'degraded' | 'down' = 'healthy';
    if (events24h === 0) {
      status = 'down';
    } else if (events24h < 100) {
      status = 'degraded';
    }

    return {
      status,
      uptime_seconds: Math.floor(process.uptime()),
      events_processed_24h: events24h,
      last_event_received: lastEvent,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get analytics health');
    throw error;
  }
}
