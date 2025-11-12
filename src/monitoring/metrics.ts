import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { apiLogger as logger } from '../utils/logger.js';

// Create a Registry
export const register = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// Custom metrics for the analytics server

// API Request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Events metrics
export const eventsReceived = new Counter({
  name: 'events_received_total',
  help: 'Total number of analytics events received',
  labelNames: ['analytics_level', 'tool'],
  registers: [register],
});

export const eventsProcessed = new Counter({
  name: 'events_processed_total',
  help: 'Total number of analytics events processed',
  labelNames: ['status'],
  registers: [register],
});

export const eventsProcessingDuration = new Histogram({
  name: 'events_processing_duration_seconds',
  help: 'Duration of event processing in seconds',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Queue metrics
export const queueDepth = new Gauge({
  name: 'queue_depth',
  help: 'Current depth of the event queue',
  registers: [register],
});

export const queueOperations = new Counter({
  name: 'queue_operations_total',
  help: 'Total number of queue operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// Database metrics
export const databaseQueries = new Counter({
  name: 'database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
  registers: [register],
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const databaseConnectionPool = new Gauge({
  name: 'database_connection_pool',
  help: 'Database connection pool statistics',
  labelNames: ['state'],
  registers: [register],
});

// Cache metrics
export const cacheOperations = new Counter({
  name: 'cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result'],
  registers: [register],
});

// Worker metrics
export const workerBatchSize = new Histogram({
  name: 'worker_batch_size',
  help: 'Size of batches processed by worker',
  buckets: [1, 5, 10, 25, 50, 100, 200, 500],
  registers: [register],
});

export const workerErrors = new Counter({
  name: 'worker_errors_total',
  help: 'Total number of worker errors',
  labelNames: ['error_type'],
  registers: [register],
});

// Initialize metrics
logger.info('Prometheus metrics initialized');

// Helper function to update connection pool metrics
export function updateConnectionPoolMetrics(stats: {
  total: number;
  idle: number;
  waiting: number;
}) {
  databaseConnectionPool.set({ state: 'total' }, stats.total);
  databaseConnectionPool.set({ state: 'idle' }, stats.idle);
  databaseConnectionPool.set({ state: 'waiting' }, stats.waiting);
}

// Helper function to record HTTP request
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number
) {
  httpRequestsTotal.inc({ method, route, status_code: statusCode });
  httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
}

// Helper function to record event reception
export function recordEventReceived(analyticsLevel: string, tool: string, count: number = 1) {
  eventsReceived.inc({ analytics_level: analyticsLevel, tool }, count);
}

// Helper function to record event processing
export function recordEventProcessed(status: 'success' | 'error', count: number = 1) {
  eventsProcessed.inc({ status }, count);
}
