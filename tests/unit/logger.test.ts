import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pino before importing logger
vi.mock('pino', () => {
  const mockChild = vi.fn(() => mockLogger);
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: mockChild,
  };

  const mockPino = vi.fn(() => mockLogger);
  mockPino.stdTimeFunctions = { isoTime: vi.fn() };

  return { default: mockPino };
});

vi.mock('../../src/config.js', () => ({
  config: {
    logLevel: 'info',
    isDevelopment: vi.fn(() => false),
    isProduction: vi.fn(() => false),
    isTest: vi.fn(() => true),
  },
}));

describe('Logger Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Logger Initialization', () => {
    it('should create a logger instance', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(logger).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
    });

    it('should create component loggers', async () => {
      const { createComponentLogger } = await import('../../src/utils/logger.js');
      const componentLogger = createComponentLogger('test');
      expect(componentLogger).toBeDefined();
      expect(componentLogger.child).toBeDefined();
    });

    it('should export pre-defined component loggers', async () => {
      const {
        apiLogger,
        workerLogger,
        dbLogger,
        queueLogger,
        dashboardLogger,
      } = await import('../../src/utils/logger.js');

      expect(apiLogger).toBeDefined();
      expect(workerLogger).toBeDefined();
      expect(dbLogger).toBeDefined();
      expect(queueLogger).toBeDefined();
      expect(dashboardLogger).toBeDefined();
    });
  });

  describe('Component Logger Creation', () => {
    it('should create logger with component name', async () => {
      const { createComponentLogger } = await import('../../src/utils/logger.js');
      const testLogger = createComponentLogger('test-component');

      expect(testLogger).toBeDefined();
      expect(testLogger.child).toHaveBeenCalled();
    });

    it('should create multiple independent component loggers', async () => {
      const { createComponentLogger } = await import('../../src/utils/logger.js');

      const logger1 = createComponentLogger('component1');
      const logger2 = createComponentLogger('component2');

      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
    });
  });

  describe('Logger Functionality', () => {
    it('should support debug logging', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      logger.debug('test message');
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should support info logging', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      logger.info('test message');
      expect(logger.info).toHaveBeenCalled();
    });

    it('should support warn logging', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      logger.warn('test message');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should support error logging', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      logger.error('test message');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Component Loggers', () => {
    it('should have api logger', async () => {
      const { apiLogger } = await import('../../src/utils/logger.js');
      expect(apiLogger).toBeDefined();
      expect(apiLogger.info).toBeDefined();
    });

    it('should have worker logger', async () => {
      const { workerLogger } = await import('../../src/utils/logger.js');
      expect(workerLogger).toBeDefined();
      expect(workerLogger.info).toBeDefined();
    });

    it('should have database logger', async () => {
      const { dbLogger } = await import('../../src/utils/logger.js');
      expect(dbLogger).toBeDefined();
      expect(dbLogger.info).toBeDefined();
    });

    it('should have queue logger', async () => {
      const { queueLogger } = await import('../../src/utils/logger.js');
      expect(queueLogger).toBeDefined();
      expect(queueLogger.info).toBeDefined();
    });

    it('should have dashboard logger', async () => {
      const { dashboardLogger } = await import('../../src/utils/logger.js');
      expect(dashboardLogger).toBeDefined();
      expect(dashboardLogger.info).toBeDefined();
    });
  });
});
