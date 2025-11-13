import { config } from '../config.js';
import { workerLogger as logger } from '../utils/logger.js';
import { dequeueEvents, queueEvents, getQueueDepth, closeRedisConnection } from '../queue/index.js';
import {
  insertEvents,
  updateAggregations,
  closeDatabaseConnection,
} from '../database/index.js';

// Worker state
let isRunning = false;
let isShuttingDown = false;
let processingCount = 0;
let statsInterval: NodeJS.Timeout | null = null;

// Statistics
let totalProcessed = 0;
let totalErrors = 0;
let lastProcessedAt: Date | null = null;

/**
 * Process a batch of events from the queue
 */
async function processBatch(): Promise<void> {
  try {
    // Dequeue a batch of events
    const events = await dequeueEvents(config.queue.batchSize);

    if (events.length === 0) {
      // Queue is empty, nothing to process
      logger.debug('Queue is empty, nothing to process');
      return;
    }

    // Check shutdown AFTER dequeue but BEFORE incrementing counter
    // If shutting down, re-queue the events so they're not lost
    if (isShuttingDown) {
      logger.warn('Shutdown detected, re-queuing events');
      await queueEvents(events);
      return;
    }

    processingCount++;

    logger.info({
      count: events.length,
      queueDepth: await getQueueDepth(),
    }, 'Processing event batch');

    // Insert events into database
    try {
      await insertEvents(events);
      logger.debug({ count: events.length }, 'Events inserted successfully');
    } catch (insertError) {
      logger.error({
        error: insertError,
        count: events.length,
      }, 'Failed to insert events');
      throw insertError;
    }

    // Update aggregations
    try {
      await updateAggregations(events);
      logger.debug({ count: events.length }, 'Aggregations updated successfully');
    } catch (aggError) {
      logger.error({
        error: aggError,
        count: events.length,
      }, 'Failed to update aggregations');
      // Don't throw - aggregations can be rebuilt later if needed
    }

    // Update statistics
    totalProcessed += events.length;
    lastProcessedAt = new Date();

    logger.info({
      batchSize: events.length,
      totalProcessed,
      queueDepth: await getQueueDepth(),
    }, 'Batch processed successfully');

  } catch (error) {
    totalErrors++;
    logger.error({
      error,
      totalErrors,
      totalProcessed,
    }, 'Error processing batch');
  } finally {
    if (processingCount > 0) {
      processingCount--;
    }
  }
}

/**
 * Worker main loop
 */
async function workerLoop(): Promise<void> {
  while (isRunning && !isShuttingDown) {
    try {
      await processBatch();
    } catch (error) {
      logger.error({ error }, 'Unexpected error in worker loop');
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, config.queue.pollIntervalMs));
  }

  logger.info('Worker loop stopped');
}

/**
 * Start the worker
 */
export async function startWorker(): Promise<void> {
  if (isRunning) {
    logger.warn('Worker is already running');
    return;
  }

  logger.info({
    pollInterval: config.queue.pollIntervalMs,
    batchSize: config.queue.batchSize,
    queueKey: config.queue.key,
  }, 'Starting analytics worker');

  isRunning = true;
  isShuttingDown = false;

  // Start the worker loop (don't await, let it run in background)
  workerLoop().catch((error) => {
    logger.error({ error }, 'Worker loop crashed');
    isRunning = false;
  });

  logger.info('Analytics worker started');
}

/**
 * Stop the worker gracefully
 */
export async function stopWorker(): Promise<void> {
  if (!isRunning) {
    logger.warn('Worker is not running');
    return;
  }

  logger.info('Stopping analytics worker');
  isShuttingDown = true;
  isRunning = false;

  // Wait for any in-progress batches to complete
  const maxWaitTime = 30000; // 30 seconds
  const startTime = Date.now();

  while (processingCount > 0 && Date.now() - startTime < maxWaitTime) {
    logger.info({
      processingCount,
      elapsed: Date.now() - startTime,
    }, 'Waiting for in-progress batches to complete');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (processingCount > 0) {
    logger.warn({
      processingCount,
    }, 'Worker stopped with batches still in progress');
  }

  // Clear stats interval
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
    logger.debug('Stats interval cleared');
  }

  // Close connections
  try {
    await closeRedisConnection();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error({ error }, 'Error closing Redis connection');
  }

  try {
    await closeDatabaseConnection();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error({ error }, 'Error closing database connection');
  }

  logger.info({
    totalProcessed,
    totalErrors,
    lastProcessedAt,
  }, 'Analytics worker stopped');
}

/**
 * Get worker statistics
 */
export function getWorkerStats() {
  return {
    isRunning,
    isShuttingDown,
    processingCount,
    totalProcessed,
    totalErrors,
    lastProcessedAt,
  };
}

// Graceful shutdown handlers
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal');

  try {
    await stopWorker();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker().catch((error) => {
    logger.error({ error }, 'Failed to start worker');
    process.exit(1);
  });

  // Log stats periodically
  statsInterval = setInterval(() => {
    const stats = getWorkerStats();
    logger.info({
      ...stats,
      queueDepth: 'pending', // Will be fetched async
    }, 'Worker statistics');

    // Async fetch queue depth for next log
    getQueueDepth()
      .then((depth) => {
        logger.debug({ queueDepth: depth }, 'Current queue depth');
      })
      .catch((error) => {
        logger.error({ error }, 'Failed to get queue depth for stats');
      });
  }, 60000); // Every minute
}
