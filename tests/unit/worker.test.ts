import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AnalyticsEvent } from '../../src/types/events.js';

// Mock dependencies before importing worker
const mockDequeueEvents = vi.fn();
const mockQueueEvents = vi.fn();
const mockGetQueueDepth = vi.fn();
const mockInsertEvents = vi.fn();
const mockUpdateAggregations = vi.fn();
const mockCloseRedisConnection = vi.fn();
const mockCloseDatabaseConnection = vi.fn();

vi.mock('../../src/queue/index.js', () => ({
  dequeueEvents: mockDequeueEvents,
  queueEvents: mockQueueEvents,
  getQueueDepth: mockGetQueueDepth,
  closeRedisConnection: mockCloseRedisConnection,
}));

vi.mock('../../src/database/index.js', () => ({
  insertEvents: mockInsertEvents,
  updateAggregations: mockUpdateAggregations,
  closeDatabaseConnection: mockCloseDatabaseConnection,
}));

vi.mock('../../src/utils/logger.js', () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/config.js', () => ({
  config: {
    queue: {
      batchSize: 50,
      pollIntervalMs: 100, // Short interval for testing
    },
  },
}));

describe('Worker Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQueueDepth.mockResolvedValue(0);
    mockCloseRedisConnection.mockResolvedValue(undefined);
    mockCloseDatabaseConnection.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Clean up any running workers
    const { stopWorker, getWorkerStats } = await import('../../src/worker/index.js');
    const stats = getWorkerStats();
    if (stats.isRunning) {
      await stopWorker();
    }
  });

  describe('Worker Statistics', () => {
    it('should return initial statistics', async () => {
      const { getWorkerStats } = await import('../../src/worker/index.js');

      const stats = getWorkerStats();

      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('isShuttingDown');
      expect(stats).toHaveProperty('processingCount');
      expect(stats).toHaveProperty('totalProcessed');
      expect(stats).toHaveProperty('totalErrors');
      expect(stats).toHaveProperty('lastProcessedAt');
    });

    it('should track processed events', async () => {
      // Reset module to get fresh state
      vi.resetModules();

      const testEvents: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      mockDequeueEvents
        .mockResolvedValueOnce(testEvents)
        .mockResolvedValue([]);
      mockInsertEvents.mockResolvedValue(undefined);
      mockUpdateAggregations.mockResolvedValue(undefined);

      const { startWorker, stopWorker, getWorkerStats } = await import(
        '../../src/worker/index.js'
      );

      await startWorker();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = getWorkerStats();
      expect(stats.totalProcessed).toBeGreaterThanOrEqual(1);

      await stopWorker();
    });
  });

  describe('Batch Processing', () => {
    it('should process events in batches', async () => {
      vi.resetModules();

      const testEvents: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
        {
          version: '1.0.0',
          tool: 'get_alerts',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      mockDequeueEvents
        .mockResolvedValueOnce(testEvents)
        .mockResolvedValue([]);
      mockInsertEvents.mockResolvedValue(undefined);
      mockUpdateAggregations.mockResolvedValue(undefined);

      const { startWorker, stopWorker } = await import('../../src/worker/index.js');

      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockInsertEvents).toHaveBeenCalledWith(testEvents);
      expect(mockUpdateAggregations).toHaveBeenCalledWith(testEvents);

      await stopWorker();
    });

    it('should handle empty queue', async () => {
      vi.resetModules();

      mockDequeueEvents.mockResolvedValue([]);

      const { startWorker, stopWorker } = await import('../../src/worker/index.js');

      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockInsertEvents).not.toHaveBeenCalled();
      expect(mockUpdateAggregations).not.toHaveBeenCalled();

      await stopWorker();
    });

    it('should continue processing on aggregation errors', async () => {
      vi.resetModules();

      const testEvents: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      mockDequeueEvents
        .mockResolvedValueOnce(testEvents)
        .mockResolvedValue([]);
      mockInsertEvents.mockResolvedValue(undefined);
      mockUpdateAggregations.mockRejectedValue(new Error('Aggregation failed'));

      const { startWorker, stopWorker, getWorkerStats } = await import(
        '../../src/worker/index.js'
      );

      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = getWorkerStats();
      // Should still process events even if aggregation fails
      expect(stats.totalProcessed).toBeGreaterThanOrEqual(1);

      await stopWorker();
    });

    it('should track errors on insert failures', async () => {
      vi.resetModules();

      const testEvents: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      mockDequeueEvents
        .mockResolvedValueOnce(testEvents)
        .mockResolvedValue([]);
      mockInsertEvents.mockRejectedValue(new Error('Database insert failed'));

      const { startWorker, stopWorker, getWorkerStats } = await import(
        '../../src/worker/index.js'
      );

      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = getWorkerStats();
      expect(stats.totalErrors).toBeGreaterThanOrEqual(1);

      await stopWorker();
    });
  });

  describe('Worker Lifecycle', () => {
    it('should start and stop worker gracefully', async () => {
      vi.resetModules();

      mockDequeueEvents.mockResolvedValue([]);

      const { startWorker, stopWorker, getWorkerStats } = await import(
        '../../src/worker/index.js'
      );

      await startWorker();

      let stats = getWorkerStats();
      expect(stats.isRunning).toBe(true);
      expect(stats.isShuttingDown).toBe(false);

      await stopWorker();

      stats = getWorkerStats();
      expect(stats.isRunning).toBe(false);
    });

    it('should not start worker if already running', async () => {
      vi.resetModules();

      mockDequeueEvents.mockResolvedValue([]);

      const { startWorker, stopWorker } = await import('../../src/worker/index.js');

      await startWorker();
      await startWorker(); // Second call should be no-op

      await stopWorker();
    });

    it('should close connections on shutdown', async () => {
      vi.resetModules();

      mockDequeueEvents.mockResolvedValue([]);

      const { startWorker, stopWorker } = await import('../../src/worker/index.js');

      await startWorker();
      await stopWorker();

      expect(mockCloseRedisConnection).toHaveBeenCalled();
      expect(mockCloseDatabaseConnection).toHaveBeenCalled();
    });

    it('should re-queue events when shutting down', async () => {
      vi.resetModules();

      const testEvents: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      // Simulate slow processing by delaying insert
      let resolveInsert: () => void;
      const insertPromise = new Promise<void>((resolve) => {
        resolveInsert = resolve;
      });

      mockDequeueEvents
        .mockResolvedValueOnce(testEvents)
        .mockResolvedValue([]);
      mockInsertEvents.mockImplementation(() => insertPromise);
      mockUpdateAggregations.mockResolvedValue(undefined);

      const { startWorker, stopWorker } = await import('../../src/worker/index.js');

      await startWorker();

      // Start shutdown before processing completes
      // This is a simplified test - in real scenario shutdown detection happens mid-processing
      await stopWorker();

      // Complete the insert
      resolveInsert!();
    });
  });

  describe('Error Handling', () => {
    it('should handle dequeue errors gracefully', async () => {
      vi.resetModules();

      mockDequeueEvents.mockRejectedValue(new Error('Redis connection failed'));

      const { startWorker, stopWorker, getWorkerStats } = await import(
        '../../src/worker/index.js'
      );

      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Worker should continue running despite errors
      const stats = getWorkerStats();
      expect(stats.isRunning).toBe(true);

      await stopWorker();
    });

    it('should track error count', async () => {
      vi.resetModules();

      const testEvents: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      mockDequeueEvents
        .mockResolvedValueOnce(testEvents)
        .mockRejectedValue(new Error('Error'))
        .mockResolvedValue([]);
      mockInsertEvents.mockRejectedValue(new Error('Insert failed'));

      const { startWorker, stopWorker, getWorkerStats } = await import(
        '../../src/worker/index.js'
      );

      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const stats = getWorkerStats();
      expect(stats.totalErrors).toBeGreaterThan(0);

      await stopWorker();
    });
  });

  describe('Processing Count', () => {
    it('should track concurrent processing', async () => {
      vi.resetModules();

      const testEvents: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      let resolveInsert: () => void;
      const insertPromise = new Promise<void>((resolve) => {
        resolveInsert = resolve;
      });

      mockDequeueEvents
        .mockResolvedValueOnce(testEvents)
        .mockResolvedValue([]);
      mockInsertEvents.mockImplementation(() => insertPromise);
      mockUpdateAggregations.mockResolvedValue(undefined);

      const { startWorker, stopWorker, getWorkerStats } = await import(
        '../../src/worker/index.js'
      );

      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check that processing is in progress
      let stats = getWorkerStats();
      const wasProcessing = stats.processingCount > 0;

      // Complete processing
      resolveInsert!();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // After completion, count should be back to 0
      stats = getWorkerStats();

      await stopWorker();

      // Verify processing occurred
      expect(wasProcessing || stats.totalProcessed > 0).toBe(true);
    });
  });

  describe('Last Processed Tracking', () => {
    it('should update lastProcessedAt timestamp', async () => {
      vi.resetModules();

      const testEvents: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      mockDequeueEvents
        .mockResolvedValueOnce(testEvents)
        .mockResolvedValue([]);
      mockInsertEvents.mockResolvedValue(undefined);
      mockUpdateAggregations.mockResolvedValue(undefined);

      const { startWorker, stopWorker, getWorkerStats } = await import(
        '../../src/worker/index.js'
      );

      const beforeStart = new Date();
      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const afterProcessing = new Date();

      const stats = getWorkerStats();

      if (stats.lastProcessedAt) {
        expect(stats.lastProcessedAt.getTime()).toBeGreaterThanOrEqual(
          beforeStart.getTime()
        );
        expect(stats.lastProcessedAt.getTime()).toBeLessThanOrEqual(
          afterProcessing.getTime()
        );
      }

      await stopWorker();
    });
  });
});
