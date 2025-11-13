import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config.js';
import { apiLogger as logger } from '../utils/logger.js';
import { validateEventBatch } from './validation.js';
import { pool, checkDatabaseHealth, getDatabaseStats } from '../database/index.js';
import { queueEvents, getQueueDepth, redis } from '../queue/index.js';
import {
  getToolsStats,
  getToolStats,
  getErrorStats,
  getPerformanceStats,
} from './stats.js';
import { register, recordHttpRequest, updateConnectionPoolMetrics, queueDepth as queueDepthGauge, recordEventReceived } from '../monitoring/metrics.js';
import type { EventBatchRequest, EventBatchResponse, ErrorResponse } from '../types/events.js';
import {
  getAnalyticsData,
  getOverviewStats,
  getAnalyticsHealth,
} from '../database/queries.js';

import crypto from 'crypto';

// Create Fastify instance
const server = Fastify({
  logger: false, // We use our custom logger
  trustProxy: config.security.trustProxy,
  bodyLimit: config.api.bodyLimitBytes,
  disableRequestLogging: true, // We'll do custom request logging
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  genReqId: () => crypto.randomUUID(), // Cryptographically secure request IDs
});

// Register CORS
await server.register(cors, {
  origin: config.security.corsOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
});

// Register rate limiting
await server.register(rateLimit, {
  max: config.api.rateLimitPerMinute,
  timeWindow: '1 minute',
  ban: 3, // Ban after 3 violations
  cache: 10000, // Keep track of 10k IPs
  allowList: [], // No allowlist by default
  redis: redis, // Use Redis for multi-instance support
  skipOnError: false,
  addHeadersOnExceeding: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
  },
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
  },
  errorResponseBuilder: (_request, context) => {
    return {
      error: 'rate_limit_exceeded',
      message: 'Too many requests, please try again later',
      retry_after: Math.ceil(context.ttl / 1000),
    } as ErrorResponse;
  },
});

// Custom request logging hook
server.addHook('onRequest', async (request) => {
  logger.info({
    reqId: request.id,
    method: request.method,
    url: request.url,
    // Deliberately NOT logging IP address for privacy
  }, 'Request received');
});

// Custom response logging hook
server.addHook('onResponse', async (request, reply) => {
  const responseTime = reply.elapsedTime;
  logger.info({
    reqId: request.id,
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime: `${responseTime.toFixed(2)}ms`,
  }, 'Request completed');

  // Record metrics (skip /metrics and /v1/health endpoints)
  if (!request.url.includes('/metrics') && !request.url.includes('/v1/health')) {
    const route = request.routeOptions?.url || request.url;
    recordHttpRequest(request.method, route, reply.statusCode, responseTime / 1000);
  }
});

// Error handler
server.setErrorHandler((error, request, reply) => {
  logger.error({
    reqId: request.id,
    error: {
      message: error.message,
      stack: config.isDevelopment() ? error.stack : undefined,
    },
  }, 'Request error');

  const statusCode = error.statusCode || 500;
  const response: ErrorResponse = {
    error: error.name || 'internal_server_error',
    details: config.isDevelopment() ? error.message : 'An internal error occurred',
  };

  reply.status(statusCode).send(response);
});

// =============================================================================
// ROUTES
// =============================================================================

// Prometheus metrics endpoint (no rate limit)
server.get('/metrics', async (_request, reply) => {
  try {
    // Update dynamic metrics before returning
    const dbStats = await getDatabaseStats();
    updateConnectionPoolMetrics({
      total: dbStats.total_connections,
      idle: dbStats.idle_connections,
      waiting: dbStats.waiting_count,
    });

    const currentQueueDepth = await getQueueDepth();
    queueDepthGauge.set(currentQueueDepth);

    reply.header('Content-Type', register.contentType);
    return register.metrics();
  } catch (error) {
    logger.error({ error }, 'Failed to generate metrics');
    reply.status(500);
    return { error: 'Failed to generate metrics' };
  }
});

// Health check endpoint (no rate limit)
server.get('/v1/health', async (_request, reply) => {
  const isHealthy = await checkDatabaseHealth();

  if (!isHealthy) {
    reply.status(503);
    return {
      status: 'unhealthy',
      database: 'disconnected',
    };
  }

  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
});

// Status endpoint (detailed system status)
server.get('/v1/status', async (_request, reply) => {
  try {
    const [dbHealthy, dbStats, queueDepth] = await Promise.all([
      checkDatabaseHealth(),
      getDatabaseStats(),
      getQueueDepth(),
    ]);

    return {
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      database: {
        connected: dbHealthy,
        total_connections: dbStats.total_connections,
        idle_connections: dbStats.idle_connections,
        waiting_count: dbStats.waiting_count,
      },
      queue: {
        depth: queueDepth,
      },
      memory: {
        used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get system status');
    reply.status(500);
    return {
      status: 'error',
      error: 'Failed to retrieve system status',
    };
  }
});

// =============================================================================
// STATS API ENDPOINTS
// =============================================================================

// Get all tools statistics
server.get<{
  Querystring: { period?: string };
}>('/v1/stats/tools', async (request, reply) => {
  try {
    const { period = '30d' } = request.query;
    const tools = await getToolsStats(period);
    return { period, tools };
  } catch (error: any) {
    logger.error({ error, reqId: request.id }, 'Failed to get tools stats');
    reply.status(400);
    return {
      error: 'invalid_request',
      details: error.message || 'Failed to retrieve tool statistics',
    } as ErrorResponse;
  }
});

// Get specific tool statistics
server.get<{
  Params: { toolName: string };
  Querystring: { period?: string };
}>('/v1/stats/tool/:toolName', async (request, reply) => {
  try {
    const { toolName } = request.params;
    const { period = '30d' } = request.query;
    const stats = await getToolStats(toolName, period);

    if (!stats) {
      reply.status(404);
      return {
        error: 'not_found',
        details: `Tool '${toolName}' not found or has no data`,
      } as ErrorResponse;
    }

    return stats;
  } catch (error: any) {
    logger.error({ error, reqId: request.id }, 'Failed to get tool stats');
    reply.status(400);
    return {
      error: 'invalid_request',
      details: error.message || 'Failed to retrieve tool statistics',
    } as ErrorResponse;
  }
});

// Get error statistics
server.get<{
  Querystring: { period?: string };
}>('/v1/stats/errors', async (request, reply) => {
  try {
    const { period = '30d' } = request.query;
    const errors = await getErrorStats(period);
    return { period, errors };
  } catch (error: any) {
    logger.error({ error, reqId: request.id }, 'Failed to get error stats');
    reply.status(400);
    return {
      error: 'invalid_request',
      details: error.message || 'Failed to retrieve error statistics',
    } as ErrorResponse;
  }
});

// Get performance statistics
server.get<{
  Querystring: { period?: string };
}>('/v1/stats/performance', async (request, reply) => {
  try {
    const { period = '30d' } = request.query;
    const stats = await getPerformanceStats(period);
    return stats;
  } catch (error: any) {
    logger.error({ error, reqId: request.id }, 'Failed to get performance stats');
    reply.status(400);
    return {
      error: 'invalid_request',
      details: error.message || 'Failed to retrieve performance statistics',
    } as ErrorResponse;
  }
});

// =============================================================================
// EVENT INGESTION ENDPOINT
// =============================================================================

// Event ingestion endpoint
server.post<{
  Body: EventBatchRequest;
}>('/v1/events', async (request, reply) => {
  try {
    const { body } = request;

    // Validate the event batch
    const validationResult = validateEventBatch(body);

    if (!validationResult.valid) {
      reply.status(400);
      return {
        error: 'validation_failed',
        details: validationResult.errors,
      } as ErrorResponse;
    }

    const events = validationResult.data!;

    // Queue events for async processing
    try {
      await queueEvents(events);
    } catch (queueError) {
      logger.error({ error: queueError }, 'Failed to queue events');
      reply.status(503);
      return {
        error: 'service_unavailable',
        details: 'Analytics queue is temporarily full, please retry later',
        retry_after: 60,
      } as ErrorResponse;
    }

    // Record metrics
    events.forEach((event) => {
      recordEventReceived(event.analytics_level, event.tool);
    });

    logger.info({
      reqId: request.id,
      count: events.length,
      levels: events.reduce((acc, e) => {
        acc[e.analytics_level] = (acc[e.analytics_level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    }, 'Events queued successfully');

    // Return success response
    return {
      status: 'accepted',
      count: events.length,
      timestamp: new Date().toISOString(),
    } as EventBatchResponse;
  } catch (error) {
    logger.error({ reqId: request.id, error }, 'Event ingestion failed');
    reply.status(503);
    return {
      error: 'service_unavailable',
      details: 'Analytics service temporarily unavailable',
    } as ErrorResponse;
  }
});

// Statistics endpoint - Get overview statistics
server.get<{
  Querystring: { period?: string };
}>('/v1/stats/overview', async (request, reply) => {
  try {
    const period = request.query.period || '24h';

    logger.debug({ period }, 'Fetching overview stats');

    const stats = await getOverviewStats(period);
    return stats;
  } catch (error) {
    logger.error({ error, query: request.query }, 'Failed to get overview stats');
    reply.status(500);
    return {
      error: 'internal_server_error',
      details: 'Failed to retrieve statistics',
    } as ErrorResponse;
  }
});

// Statistics endpoint - Get complete analytics data
server.get<{
  Querystring: { period?: string };
}>('/v1/stats/all', async (request, reply) => {
  try {
    const period = request.query.period || '24h';

    logger.debug({ period }, 'Fetching complete analytics data');

    const data = await getAnalyticsData(period);
    return data;
  } catch (error) {
    logger.error({ error, query: request.query }, 'Failed to get analytics data');
    reply.status(500);
    return {
      error: 'internal_server_error',
      details: 'Failed to retrieve analytics data',
    } as ErrorResponse;
  }
});

// Statistics endpoint - Get analytics health
server.get('/v1/stats/health', async (_request, reply) => {
  try {
    const health = await getAnalyticsHealth();
    return health;
  } catch (error) {
    logger.error({ error }, 'Failed to get analytics health');
    reply.status(500);
    return {
      error: 'internal_server_error',
      details: 'Failed to retrieve health status',
    } as ErrorResponse;
  }
});

// =============================================================================
// SERVER LIFECYCLE
// =============================================================================

// Graceful shutdown handler
async function closeGracefully(signal: string) {
  logger.info({ signal }, 'Received shutdown signal');

  try {
    // Close Fastify server (stop accepting new requests)
    await server.close();
    logger.info('API server closed');

    // Close database pool
    await pool.end();
    logger.info('Database pool closed');

    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => closeGracefully('SIGTERM'));
process.on('SIGINT', () => closeGracefully('SIGINT'));

// Start server
async function start() {
  try {
    // Check database health before starting
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      logger.error('Database health check failed, cannot start server');
      process.exit(1);
    }

    logger.info('Database health check passed');

    // Start listening
    await server.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    logger.info({
      port: config.port,
      env: config.nodeEnv,
      cors: config.security.corsOrigin,
      rateLimit: `${config.api.rateLimitPerMinute}/min`,
    }, 'Analytics API server started');

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Only start if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { server, start };
