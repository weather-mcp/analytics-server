import { Pool } from 'pg';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { dbLogger as logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Migration {
  id: number;
  filename: string;
  name: string;
  sql: string;
}

interface MigrationRecord {
  id: number;
  name: string;
  executed_at: Date;
}

// Create migrations tracking table
async function createMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  logger.debug('Migrations tracking table ensured');
}

// Get list of executed migrations
async function getExecutedMigrations(pool: Pool): Promise<Set<number>> {
  const result = await pool.query<MigrationRecord>(
    'SELECT id, name, executed_at FROM schema_migrations ORDER BY id'
  );

  const executed = new Set<number>();
  for (const row of result.rows) {
    executed.add(row.id);
    logger.debug({ id: row.id, name: row.name, executed_at: row.executed_at }, 'Migration already executed');
  }

  return executed;
}

// Read migration files from disk
async function readMigrationFiles(): Promise<Migration[]> {
  const migrationsDir = join(__dirname, 'migrations');

  try {
    const files = await readdir(migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort(); // Sort alphabetically (001_, 002_, etc.)

    const migrations: Migration[] = [];

    for (const filename of migrationFiles) {
      // Extract migration ID from filename (e.g., "001_initial_schema.sql" -> 1)
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        logger.warn({ filename }, 'Invalid migration filename format, skipping');
        continue;
      }

      const id = parseInt(match[1], 10);
      const name = match[2];
      const filePath = join(migrationsDir, filename);
      const sql = await readFile(filePath, 'utf-8');

      migrations.push({ id, filename, name, sql });
    }

    return migrations.sort((a, b) => a.id - b.id);
  } catch (error) {
    logger.error({ error }, 'Failed to read migration files');
    throw error;
  }
}

// Execute a single migration
async function executeMigration(pool: Pool, migration: Migration): Promise<void> {
  const client = await pool.connect();

  try {
    logger.info({ id: migration.id, name: migration.name }, 'Executing migration');

    await client.query('BEGIN');

    // Execute the migration SQL
    await client.query(migration.sql);

    // Record that this migration was executed
    await client.query(
      'INSERT INTO schema_migrations (id, name, executed_at) VALUES ($1, $2, NOW())',
      [migration.id, migration.name]
    );

    await client.query('COMMIT');

    logger.info({ id: migration.id, name: migration.name }, 'Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error, id: migration.id, name: migration.name }, 'Migration failed');
    throw error;
  } finally {
    client.release();
  }
}

// Run all pending migrations
export async function runMigrations(pool: Pool): Promise<void> {
  try {
    logger.info('Starting database migrations');

    // Ensure migrations table exists
    await createMigrationsTable(pool);

    // Get list of executed migrations
    const executed = await getExecutedMigrations(pool);

    // Read migration files
    const migrations = await readMigrationFiles();

    if (migrations.length === 0) {
      logger.warn('No migration files found');
      return;
    }

    // Filter out already executed migrations
    const pending = migrations.filter(m => !executed.has(m.id));

    if (pending.length === 0) {
      logger.info('All migrations are up to date');
      return;
    }

    logger.info({ pending: pending.length }, 'Running pending migrations');

    // Execute pending migrations in order
    for (const migration of pending) {
      await executeMigration(pool, migration);
    }

    logger.info({ total: migrations.length, executed: pending.length }, 'All migrations completed');
  } catch (error) {
    logger.error({ error }, 'Migration process failed');
    throw error;
  }
}

// Get current schema version (latest executed migration)
export async function getSchemaVersion(pool: Pool): Promise<number | null> {
  try {
    await createMigrationsTable(pool);

    const result = await pool.query<{ id: number }>(
      'SELECT MAX(id) as id FROM schema_migrations'
    );

    return result.rows[0]?.id ?? null;
  } catch (error) {
    logger.error({ error }, 'Failed to get schema version');
    return null;
  }
}

// Check if migrations are needed
export async function checkMigrationsNeeded(pool: Pool): Promise<boolean> {
  try {
    await createMigrationsTable(pool);
    const executed = await getExecutedMigrations(pool);
    const migrations = await readMigrationFiles();
    const pending = migrations.filter(m => !executed.has(m.id));

    return pending.length > 0;
  } catch (error) {
    logger.error({ error }, 'Failed to check migrations status');
    return false;
  }
}
