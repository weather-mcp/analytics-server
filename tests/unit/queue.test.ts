import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AnalyticsEvent } from '../../src/types/events.js';

// Mock Redis before importing queue
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => ({
      eval: vi.fn(),
      llen: vi.fn(),
      lpop: vi.fn(),
      del: vi.fn(),
      quit: vi.fn(),
      on: vi.fn(),
      status: 'ready',
      get: vi.fn(),
      setex: vi.fn(),
      keys: vi.fn(),
    })),
  };
});

vi.mock('../../src/utils/logger.js', () => ({
  queueLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocking
const { queueEvents, dequeueEvents, getQueueDepth, clearQueue, isConnected } = await import(
  '../../src/queue/index.js'
);
const { redis } = await import('../../src/queue/index.js');

describe('Queue Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queueEvents', () => {
    it('should queue events successfully', async () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      vi.mocked(redis.eval).mockResolvedValue(1); // Success
      vi.mocked(redis.llen).mockResolvedValue(1);

      await expect(queueEvents(events)).resolves.not.toThrow();
      expect(redis.eval).toHaveBeenCalled();
    });

    it('should handle empty event array', async () => {
      await expect(queueEvents([])).resolves.not.toThrow();
      expect(redis.eval).not.toHaveBeenCalled();
    });

    it('should throw error when queue is full', async () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      vi.mocked(redis.eval).mockResolvedValue(0); // Queue full
      vi.mocked(redis.llen).mockResolvedValue(10000);

      await expect(queueEvents(events)).rejects.toThrow('Queue full');
    });

    it('should serialize events as JSON', async () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      vi.mocked(redis.eval).mockResolvedValue(1);
      vi.mocked(redis.llen).mockResolvedValue(1);

      await queueEvents(events);

      const evalCall = vi.mocked(redis.eval).mock.calls[0];
      // evalCall[0] is the script, [1] is key count, [2] is queue key, [3] is max size, [4] is first serialized event
      const serializedEvent = evalCall[4];
      expect(serializedEvent).toContain('"version":"1.0.0"');
      expect(serializedEvent).toContain('"tool":"get_forecast"');
    });

    it('should handle Redis errors gracefully', async () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      vi.mocked(redis.eval).mockRejectedValue(new Error('Redis connection failed'));

      await expect(queueEvents(events)).rejects.toThrow();
    });
  });

  describe('dequeueEvents', () => {
    it('should dequeue events successfully', async () => {
      const serializedEvents = [
        JSON.stringify({
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        }),
      ];

      vi.mocked(redis.lpop).mockResolvedValue(serializedEvents);

      const events = await dequeueEvents(10);

      expect(events).toHaveLength(1);
      expect(events[0].tool).toBe('get_forecast');
      expect(events[0].version).toBe('1.0.0');
    });

    it('should return empty array when queue is empty', async () => {
      vi.mocked(redis.lpop).mockResolvedValue(null);

      const events = await dequeueEvents(10);

      expect(events).toEqual([]);
    });

    it('should handle single event response', async () => {
      const serializedEvent = JSON.stringify({
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      });

      vi.mocked(redis.lpop).mockResolvedValue(serializedEvent);

      const events = await dequeueEvents(1);

      expect(events).toHaveLength(1);
      expect(events[0].tool).toBe('get_forecast');
    });

    it('should skip malformed events', async () => {
      const serializedEvents = [
        JSON.stringify({
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        }),
        'invalid json',
        JSON.stringify({
          version: '1.0.1',
          tool: 'get_alerts',
          status: 'success',
          timestamp_hour: '2025-11-11T15:00:00Z',
          analytics_level: 'minimal',
        }),
      ];

      vi.mocked(redis.lpop).mockResolvedValue(serializedEvents);

      const events = await dequeueEvents(10);

      expect(events).toHaveLength(2); // Should skip invalid json
      expect(events[0].version).toBe('1.0.0');
      expect(events[1].version).toBe('1.0.1');
    });

    it('should respect batch size parameter', async () => {
      const serializedEvents = [
        JSON.stringify({
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        }),
      ];

      vi.mocked(redis.lpop).mockResolvedValue(serializedEvents);

      await dequeueEvents(50);

      expect(redis.lpop).toHaveBeenCalledWith(expect.anything(), 50);
    });

    it('should handle Redis errors', async () => {
      vi.mocked(redis.lpop).mockRejectedValue(new Error('Redis connection failed'));

      await expect(dequeueEvents(10)).rejects.toThrow();
    });
  });

  describe('getQueueDepth', () => {
    it('should return current queue depth', async () => {
      vi.mocked(redis.llen).mockResolvedValue(42);

      const depth = await getQueueDepth();

      expect(depth).toBe(42);
    });

    it('should return -1 on error', async () => {
      vi.mocked(redis.llen).mockRejectedValue(new Error('Redis connection failed'));

      const depth = await getQueueDepth();

      expect(depth).toBe(-1);
    });
  });

  describe('clearQueue', () => {
    it('should clear the queue successfully', async () => {
      vi.mocked(redis.del).mockResolvedValue(1);

      await expect(clearQueue()).resolves.not.toThrow();
      expect(redis.del).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      vi.mocked(redis.del).mockRejectedValue(new Error('Redis connection failed'));

      await expect(clearQueue()).rejects.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return true when Redis is ready', () => {
      expect(isConnected()).toBe(true);
    });

    it('should return false when Redis is not ready', () => {
      Object.defineProperty(redis, 'status', {
        value: 'connecting',
        writable: true,
        configurable: true,
      });

      expect(isConnected()).toBe(false);

      // Reset
      Object.defineProperty(redis, 'status', {
        value: 'ready',
        writable: true,
        configurable: true,
      });
    });
  });

  describe('Atomic Operations', () => {
    it('should use Lua script for atomic push operations', async () => {
      const events: AnalyticsEvent[] = [
        {
          version: '1.0.0',
          tool: 'get_forecast',
          status: 'success',
          timestamp_hour: '2025-11-11T14:00:00Z',
          analytics_level: 'minimal',
        },
      ];

      vi.mocked(redis.eval).mockResolvedValue(1);
      vi.mocked(redis.llen).mockResolvedValue(1);

      await queueEvents(events);

      const evalCall = vi.mocked(redis.eval).mock.calls[0];
      expect(evalCall[0]).toContain('LLEN'); // Lua script contains LLEN
      expect(evalCall[0]).toContain('RPUSH'); // Lua script contains RPUSH
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty array from lpop', async () => {
      vi.mocked(redis.lpop).mockResolvedValue([]);

      const events = await dequeueEvents(10);

      expect(events).toEqual([]);
    });

    it('should handle very large batch sizes', async () => {
      const events: AnalyticsEvent[] = Array.from({ length: 100 }, (_, i) => ({
        version: '1.0.0',
        tool: 'get_forecast',
        status: 'success',
        timestamp_hour: '2025-11-11T14:00:00Z',
        analytics_level: 'minimal',
      }));

      vi.mocked(redis.eval).mockResolvedValue(1);
      vi.mocked(redis.llen).mockResolvedValue(100);

      await expect(queueEvents(events)).resolves.not.toThrow();
    });
  });
});
