import Redis from 'ioredis';
import { config } from '../config.js';
import { queueLogger as logger } from '../utils/logger.js';
import type { AnalyticsEvent } from '../types/events.js';

// Create Redis client
export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn({ times, delay }, 'Retrying Redis connection');
    return delay;
  },
  reconnectOnError: (err) => {
    logger.error({ error: err.message }, 'Redis connection error');
    return true; // Always try to reconnect
  },
});

// Redis event handlers
redis.on('connect', () => {
  logger.info('Redis client connected');
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

redis.on('error', (err) => {
  logger.error({ error: err.message }, 'Redis client error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis client reconnecting');
});

// Queue configuration
const QUEUE_KEY = config.queue.key;
const MAX_QUEUE_SIZE = config.queue.maxSize;

/**
 * Queue events for async processing
 * Throws error if queue is full
 */
export async function queueEvents(events: AnalyticsEvent[]): Promise<void> {
  if (events.length === 0) {
    logger.warn('queueEvents called with empty array');
    return;
  }

  try {
    // Check current queue size
    const currentSize = await redis.llen(QUEUE_KEY);

    if (currentSize >= MAX_QUEUE_SIZE) {
      logger.error({
        currentSize,
        maxSize: MAX_QUEUE_SIZE,
      }, 'Queue size limit exceeded');

      throw new Error('Queue full, please retry later');
    }

    // Serialize events to JSON strings
    const serialized = events.map((event) => JSON.stringify(event));

    // Push to queue (right push - FIFO when using left pop)
    await redis.rpush(QUEUE_KEY, ...serialized);

    logger.debug({
      count: events.length,
      queueDepth: currentSize + events.length,
    }, 'Events queued successfully');

  } catch (error) {
    logger.error({ error, count: events.length }, 'Failed to queue events');
    throw error;
  }
}

/**
 * Dequeue a batch of events
 * Returns empty array if queue is empty
 */
export async function dequeueEvents(batchSize: number = config.queue.batchSize): Promise<AnalyticsEvent[]> {
  try {
    // Use LPOP with count to get multiple items atomically
    const serialized = await redis.lpop(QUEUE_KEY, batchSize);

    if (!serialized || (Array.isArray(serialized) && serialized.length === 0)) {
      return [];
    }

    // Handle single item (Redis returns string) or multiple items (returns array)
    const items = Array.isArray(serialized) ? serialized : [serialized];

    // Parse JSON strings back to events
    const events: AnalyticsEvent[] = [];
    for (const item of items) {
      try {
        const event = JSON.parse(item) as AnalyticsEvent;
        events.push(event);
      } catch (parseError) {
        logger.error({ error: parseError, item }, 'Failed to parse queued event');
        // Skip malformed events
      }
    }

    logger.debug({
      dequeued: events.length,
      requested: batchSize,
    }, 'Events dequeued');

    return events;

  } catch (error) {
    logger.error({ error, batchSize }, 'Failed to dequeue events');
    throw error;
  }
}

/**
 * Get current queue depth
 */
export async function getQueueDepth(): Promise<number> {
  try {
    return await redis.llen(QUEUE_KEY);
  } catch (error) {
    logger.error({ error }, 'Failed to get queue depth');
    return -1;
  }
}

/**
 * Clear all events from queue (for testing/maintenance)
 */
export async function clearQueue(): Promise<void> {
  try {
    await redis.del(QUEUE_KEY);
    logger.info('Queue cleared');
  } catch (error) {
    logger.error({ error }, 'Failed to clear queue');
    throw error;
  }
}

/**
 * Check if Redis is connected
 */
export function isConnected(): boolean {
  return redis.status === 'ready';
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedisConnection(): Promise<void> {
  try {
    await redis.quit();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error({ error }, 'Error closing Redis connection');
    throw error;
  }
}
