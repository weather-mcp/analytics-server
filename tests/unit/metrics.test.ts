import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  apiLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Metrics Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Registry', () => {
    it('should export a Prometheus registry', async () => {
      const { register } = await import('../../src/monitoring/metrics.js');
      expect(register).toBeDefined();
      expect(register.getMetricsAsJSON).toBeDefined();
    });

    it('should collect metrics', async () => {
      const { register } = await import('../../src/monitoring/metrics.js');
      const metrics = await register.getMetricsAsJSON();
      expect(metrics).toBeDefined();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('HTTP Metrics', () => {
    it('should export httpRequestsTotal counter', async () => {
      const { httpRequestsTotal } = await import('../../src/monitoring/metrics.js');
      expect(httpRequestsTotal).toBeDefined();
      expect(httpRequestsTotal.inc).toBeDefined();
    });

    it('should export httpRequestDuration histogram', async () => {
      const { httpRequestDuration } = await import('../../src/monitoring/metrics.js');
      expect(httpRequestDuration).toBeDefined();
      expect(httpRequestDuration.observe).toBeDefined();
    });

    it('should record HTTP request correctly', async () => {
      const { recordHttpRequest, httpRequestsTotal, httpRequestDuration } = await import(
        '../../src/monitoring/metrics.js'
      );

      const incSpy = vi.spyOn(httpRequestsTotal, 'inc');
      const observeSpy = vi.spyOn(httpRequestDuration, 'observe');

      recordHttpRequest('GET', '/v1/health', 200, 0.15);

      expect(incSpy).toHaveBeenCalledWith({
        method: 'GET',
        route: '/v1/health',
        status_code: 200,
      });

      expect(observeSpy).toHaveBeenCalledWith(
        { method: 'GET', route: '/v1/health', status_code: 200 },
        0.15
      );
    });
  });

  describe('Event Metrics', () => {
    it('should export eventsReceived counter', async () => {
      const { eventsReceived } = await import('../../src/monitoring/metrics.js');
      expect(eventsReceived).toBeDefined();
      expect(eventsReceived.inc).toBeDefined();
    });

    it('should export eventsProcessed counter', async () => {
      const { eventsProcessed } = await import('../../src/monitoring/metrics.js');
      expect(eventsProcessed).toBeDefined();
      expect(eventsProcessed.inc).toBeDefined();
    });

    it('should export eventsProcessingDuration histogram', async () => {
      const { eventsProcessingDuration } = await import('../../src/monitoring/metrics.js');
      expect(eventsProcessingDuration).toBeDefined();
      expect(eventsProcessingDuration.observe).toBeDefined();
    });

    it('should record event received correctly', async () => {
      const { recordEventReceived, eventsReceived } = await import(
        '../../src/monitoring/metrics.js'
      );

      const incSpy = vi.spyOn(eventsReceived, 'inc');

      recordEventReceived('standard', 'get_forecast', 5);

      expect(incSpy).toHaveBeenCalledWith(
        { analytics_level: 'standard', tool: 'get_forecast' },
        5
      );
    });

    it('should record event processed correctly', async () => {
      const { recordEventProcessed, eventsProcessed } = await import(
        '../../src/monitoring/metrics.js'
      );

      const incSpy = vi.spyOn(eventsProcessed, 'inc');

      recordEventProcessed('success', 10);

      expect(incSpy).toHaveBeenCalledWith({ status: 'success' }, 10);
    });

    it('should record error event processed', async () => {
      const { recordEventProcessed, eventsProcessed } = await import(
        '../../src/monitoring/metrics.js'
      );

      const incSpy = vi.spyOn(eventsProcessed, 'inc');

      recordEventProcessed('error', 2);

      expect(incSpy).toHaveBeenCalledWith({ status: 'error' }, 2);
    });
  });

  describe('Queue Metrics', () => {
    it('should export queueDepth gauge', async () => {
      const { queueDepth } = await import('../../src/monitoring/metrics.js');
      expect(queueDepth).toBeDefined();
      expect(queueDepth.set).toBeDefined();
    });

    it('should export queueOperations counter', async () => {
      const { queueOperations } = await import('../../src/monitoring/metrics.js');
      expect(queueOperations).toBeDefined();
      expect(queueOperations.inc).toBeDefined();
    });
  });

  describe('Database Metrics', () => {
    it('should export databaseQueries counter', async () => {
      const { databaseQueries } = await import('../../src/monitoring/metrics.js');
      expect(databaseQueries).toBeDefined();
      expect(databaseQueries.inc).toBeDefined();
    });

    it('should export databaseQueryDuration histogram', async () => {
      const { databaseQueryDuration } = await import('../../src/monitoring/metrics.js');
      expect(databaseQueryDuration).toBeDefined();
      expect(databaseQueryDuration.observe).toBeDefined();
    });

    it('should export databaseConnectionPool gauge', async () => {
      const { databaseConnectionPool } = await import('../../src/monitoring/metrics.js');
      expect(databaseConnectionPool).toBeDefined();
      expect(databaseConnectionPool.set).toBeDefined();
    });

    it('should update connection pool metrics correctly', async () => {
      const { updateConnectionPoolMetrics, databaseConnectionPool } = await import(
        '../../src/monitoring/metrics.js'
      );

      const setSpy = vi.spyOn(databaseConnectionPool, 'set');

      updateConnectionPoolMetrics({
        total: 10,
        idle: 5,
        waiting: 2,
      });

      expect(setSpy).toHaveBeenCalledWith({ state: 'total' }, 10);
      expect(setSpy).toHaveBeenCalledWith({ state: 'idle' }, 5);
      expect(setSpy).toHaveBeenCalledWith({ state: 'waiting' }, 2);
    });
  });

  describe('Cache Metrics', () => {
    it('should export cacheOperations counter', async () => {
      const { cacheOperations } = await import('../../src/monitoring/metrics.js');
      expect(cacheOperations).toBeDefined();
      expect(cacheOperations.inc).toBeDefined();
    });
  });

  describe('Worker Metrics', () => {
    it('should export workerBatchSize histogram', async () => {
      const { workerBatchSize } = await import('../../src/monitoring/metrics.js');
      expect(workerBatchSize).toBeDefined();
      expect(workerBatchSize.observe).toBeDefined();
    });

    it('should export workerErrors counter', async () => {
      const { workerErrors } = await import('../../src/monitoring/metrics.js');
      expect(workerErrors).toBeDefined();
      expect(workerErrors.inc).toBeDefined();
    });
  });

  describe('Helper Functions', () => {
    it('should have recordHttpRequest helper', async () => {
      const { recordHttpRequest } = await import('../../src/monitoring/metrics.js');
      expect(recordHttpRequest).toBeDefined();
      expect(typeof recordHttpRequest).toBe('function');
    });

    it('should have recordEventReceived helper', async () => {
      const { recordEventReceived } = await import('../../src/monitoring/metrics.js');
      expect(recordEventReceived).toBeDefined();
      expect(typeof recordEventReceived).toBe('function');
    });

    it('should have recordEventProcessed helper', async () => {
      const { recordEventProcessed } = await import('../../src/monitoring/metrics.js');
      expect(recordEventProcessed).toBeDefined();
      expect(typeof recordEventProcessed).toBe('function');
    });

    it('should have updateConnectionPoolMetrics helper', async () => {
      const { updateConnectionPoolMetrics } = await import('../../src/monitoring/metrics.js');
      expect(updateConnectionPoolMetrics).toBeDefined();
      expect(typeof updateConnectionPoolMetrics).toBe('function');
    });
  });

  describe('Metric Labels', () => {
    it('should handle different HTTP methods', async () => {
      const { recordHttpRequest } = await import('../../src/monitoring/metrics.js');

      recordHttpRequest('GET', '/v1/events', 200, 0.1);
      recordHttpRequest('POST', '/v1/events', 201, 0.2);
      recordHttpRequest('DELETE', '/v1/events', 204, 0.3);

      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should handle different event tools', async () => {
      const { recordEventReceived } = await import('../../src/monitoring/metrics.js');

      recordEventReceived('minimal', 'get_forecast');
      recordEventReceived('standard', 'get_current_conditions');
      recordEventReceived('detailed', 'get_alerts');

      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should handle different analytics levels', async () => {
      const { recordEventReceived } = await import('../../src/monitoring/metrics.js');

      recordEventReceived('minimal', 'get_forecast');
      recordEventReceived('standard', 'get_forecast');
      recordEventReceived('detailed', 'get_forecast');

      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('Default Event Counts', () => {
    it('should default to 1 event when count not specified', async () => {
      const { recordEventReceived, eventsReceived } = await import(
        '../../src/monitoring/metrics.js'
      );

      const incSpy = vi.spyOn(eventsReceived, 'inc');

      recordEventReceived('minimal', 'get_forecast');

      expect(incSpy).toHaveBeenCalledWith(
        { analytics_level: 'minimal', tool: 'get_forecast' },
        1
      );
    });

    it('should default to 1 when recording processed events', async () => {
      const { recordEventProcessed, eventsProcessed } = await import(
        '../../src/monitoring/metrics.js'
      );

      const incSpy = vi.spyOn(eventsProcessed, 'inc');

      recordEventProcessed('success');

      expect(incSpy).toHaveBeenCalledWith({ status: 'success' }, 1);
    });
  });
});
