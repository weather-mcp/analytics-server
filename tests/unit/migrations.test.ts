import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  dbLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs/promises to simulate no migration files
vi.mock('fs/promises', () => ({
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
}));

describe('Migration Module', () => {
  let mockPool: Partial<Pool>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPool = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
          return { rows: [], rowCount: 0 } as QueryResult;
        }
        if (sql.includes('SELECT id, name, executed_at FROM schema_migrations')) {
          return { rows: [], rowCount: 0 } as QueryResult;
        }
        if (sql.includes('SELECT MAX(id)')) {
          return { rows: [{ id: null }], rowCount: 1 } as QueryResult;
        }
        return { rows: [], rowCount: 0 } as QueryResult;
      }),
      connect: vi.fn(),
    };
  });

  describe('runMigrations', () => {
    it('should create schema_migrations table if not exists', async () => {
      const { runMigrations } = await import('../../src/database/migrations.js');

      await runMigrations(mockPool as Pool);

      expect(mockPool.query).toHaveBeenCalled();
      const calls = (mockPool.query as any).mock.calls;
      const createTableCall = calls.find((call: any[]) =>
        call[0].includes('CREATE TABLE IF NOT EXISTS schema_migrations')
      );
      expect(createTableCall).toBeDefined();
    });

    it('should complete when no migration files found', async () => {
      const { runMigrations } = await import('../../src/database/migrations.js');

      // Should not throw when no migration files exist
      await expect(runMigrations(mockPool as Pool)).resolves.not.toThrow();
    });

    it('should handle database query errors', async () => {
      mockPool.query = vi.fn().mockRejectedValue(new Error('Database error'));

      const { runMigrations } = await import('../../src/database/migrations.js');

      await expect(runMigrations(mockPool as Pool)).rejects.toThrow('Database error');
    });
  });

  describe('getSchemaVersion', () => {
    it('should return null when no migrations executed', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ id: null }],
        rowCount: 1,
      } as QueryResult);

      const { getSchemaVersion } = await import('../../src/database/migrations.js');

      const version = await getSchemaVersion(mockPool as Pool);

      expect(version).toBe(null);
    });

    it('should return schema version when migrations exist', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ id: 3 }],
        rowCount: 1,
      } as QueryResult);

      vi.resetModules();

      const { getSchemaVersion } = await import('../../src/database/migrations.js');

      const version = await getSchemaVersion(mockPool as Pool);

      expect(version).toBe(3);
    });

    it('should return null on database errors', async () => {
      mockPool.query = vi.fn().mockRejectedValue(new Error('Database unavailable'));

      vi.resetModules();

      const { getSchemaVersion } = await import('../../src/database/migrations.js');

      const version = await getSchemaVersion(mockPool as Pool);

      expect(version).toBe(null);
    });
  });

  describe('checkMigrationsNeeded', () => {
    it('should return false when no migrations needed', async () => {
      const { checkMigrationsNeeded } = await import('../../src/database/migrations.js');

      const needed = await checkMigrationsNeeded(mockPool as Pool);

      expect(needed).toBe(false);
    });

    it('should return false on error', async () => {
      mockPool.query = vi.fn().mockRejectedValue(new Error('Database error'));

      vi.resetModules();

      const { checkMigrationsNeeded } = await import('../../src/database/migrations.js');

      const needed = await checkMigrationsNeeded(mockPool as Pool);

      expect(needed).toBe(false);
    });
  });

  describe('Migration Safety', () => {
    it('should be safe to run migrations multiple times', async () => {
      const { runMigrations } = await import('../../src/database/migrations.js');

      // First run
      await runMigrations(mockPool as Pool);

      // Second run should not fail
      await expect(runMigrations(mockPool as Pool)).resolves.not.toThrow();
    });

    it('should handle table creation idempotently', async () => {
      const { runMigrations } = await import('../../src/database/migrations.js');

      // Multiple runs should be safe
      await runMigrations(mockPool as Pool);
      await runMigrations(mockPool as Pool);
      await runMigrations(mockPool as Pool);

      expect(true).toBe(true); // Should not throw
    });
  });
});
