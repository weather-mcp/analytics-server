import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config.js';
import { apiLogger as logger } from '../utils/logger.js';
import { validateEventBatch } from './validation.js';
import { pool, checkDatabaseHealth, getDatabaseStats } from '../database/index.js';
import { queueEvents, getQueueDepth } from '../queue/index.js';
import type { EventBatchRequest, EventBatchResponse, ErrorResponse } from '../types/events.js';

// Create Fastify instance
const server = Fastify({
  logger: false, // We use our custom logger
  trustProxy: config.security.trustProxy,
  bodyLimit: config.api.bodyLimitBytes,
  disableRequestLogging: true, // We'll do custom request logging
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
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
  redis: undefined, // Use in-memory store for now
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
  errorResponseBuilder: (request, context) => {
    return {
      error: 'rate_limit_exceeded',
      message: 'Too many requests, please try again later',
      retry_after: Math.ceil(context.ttl / 1000),
    } as ErrorResponse;
  },
});

// Custom request logging hook
server.addHook('onRequest', async (request, reply) => {
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

// Health check endpoint (no rate limit)
server.get('/v1/health', async (request, reply) => {
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
server.get('/v1/status', async (request, reply) => {
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
