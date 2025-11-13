import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value;
}

function getEnvInt(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }
  return parsed;
}

function getEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

export const config = {
  // Server Configuration
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  port: getEnvInt('PORT', 3000),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),

  // Redis Configuration
  redis: {
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvInt('REDIS_PORT', 6379),
    password: getEnvVar('REDIS_PASSWORD', ''),
    db: getEnvInt('REDIS_DB', 0),
  },

  // PostgreSQL Configuration
  database: {
    host: getEnvVar('DB_HOST', 'localhost'),
    port: getEnvInt('DB_PORT', 5432),
    database: getEnvVar('DB_NAME', 'analytics'),
    user: getEnvVar('DB_USER', 'analytics'),
    password: getEnvVar('DB_PASSWORD'),
    max: getEnvInt('DB_MAX_CONNECTIONS', 10),
    idleTimeoutMillis: getEnvInt('DB_IDLE_TIMEOUT_MS', 30000),
  },

  // Queue Configuration
  queue: {
    key: getEnvVar('QUEUE_KEY', 'analytics:events'),
    maxSize: getEnvInt('MAX_QUEUE_SIZE', 10000),
    pollIntervalMs: getEnvInt('WORKER_POLL_INTERVAL_MS', 1000),
    batchSize: getEnvInt('WORKER_BATCH_SIZE', 50),
  },

  // API Configuration
  api: {
    bodyLimitBytes: getEnvInt('API_BODY_LIMIT_KB', 100) * 1024,
    rateLimitPerMinute: getEnvInt('RATE_LIMIT_PER_MINUTE', 60),
    rateLimitBurst: getEnvInt('RATE_LIMIT_BURST', 10),
    maxBatchSize: getEnvInt('MAX_BATCH_SIZE', 100),
  },

  // Cache Configuration
  cache: {
    ttlSeconds: getEnvInt('CACHE_TTL_SECONDS', 300),
    enabled: getEnvBool('CACHE_ENABLED', true),
  },

  // Monitoring
  monitoring: {
    enabled: getEnvBool('ENABLE_METRICS', true),
    metricsPort: getEnvInt('METRICS_PORT', 9090),
  },

  // Security
  security: {
    trustProxy: getEnvBool('TRUST_PROXY', false),
    corsOrigin: getEnvVar('CORS_ORIGIN', 'https://weather-mcp.dev,https://analytics.weather-mcp.dev'),
  },

  // Data Retention
  retention: {
    rawEventsDays: getEnvInt('RAW_EVENTS_RETENTION_DAYS', 90),
    dailyAggregationsDays: getEnvInt('DAILY_AGGREGATIONS_RETENTION_DAYS', 730),
    hourlyAggregationsDays: getEnvInt('HOURLY_AGGREGATIONS_RETENTION_DAYS', 30),
    errorSummaryDays: getEnvInt('ERROR_SUMMARY_RETENTION_DAYS', 90),
  },

  // Helper methods
  isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  },

  isProduction(): boolean {
    return this.nodeEnv === 'production';
  },

  isTest(): boolean {
    return this.nodeEnv === 'test';
  },
};
