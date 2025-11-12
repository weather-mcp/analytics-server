-- Analytics Database Schema
-- This schema is designed for TimescaleDB (PostgreSQL extension)
-- Version: 1.0

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- =============================================================================
-- EVENTS TABLE (Raw Events - Hypertable)
-- =============================================================================
-- Stores raw analytics events from MCP servers
-- Retention: 90 days (configured via retention policy)

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL,

  -- Timestamps (timestamp must be part of primary key for hypertable)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamp_hour TIMESTAMPTZ NOT NULL,  -- Pre-rounded hour for grouping

  -- Core event data
  version TEXT NOT NULL,
  tool TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  analytics_level TEXT NOT NULL CHECK (analytics_level IN ('minimal', 'standard', 'detailed')),

  -- Standard level fields
  response_time_ms INTEGER CHECK (response_time_ms >= 0 AND response_time_ms <= 120000),
  service TEXT,  -- 'noaa', 'openmeteo', etc.
  cache_hit BOOLEAN,
  retry_count INTEGER CHECK (retry_count >= 0 AND retry_count <= 10),
  country TEXT,  -- ISO 3166-1 alpha-2 code

  -- Detailed level fields
  parameters JSONB,  -- Anonymized parameters (no PII)
  session_id TEXT,  -- Hashed session identifier
  sequence_number INTEGER CHECK (sequence_number >= 0),

  -- Error tracking
  error_type TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Primary key must include partitioning column for hypertable
  PRIMARY KEY (timestamp, id)
);

-- Convert to TimescaleDB hypertable
-- This enables time-series optimizations and automatic partitioning
SELECT create_hypertable('events', 'timestamp', if_not_exists => TRUE);

-- =============================================================================
-- INDEXES FOR EVENTS TABLE
-- =============================================================================

-- Index on pre-rounded hour for efficient grouping
CREATE INDEX IF NOT EXISTS idx_events_timestamp_hour ON events (timestamp_hour DESC);

-- Index on tool name for filtering by specific tools
CREATE INDEX IF NOT EXISTS idx_events_tool ON events (tool);

-- Index on status for filtering success/error events
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);

-- Index on version for version-specific queries
CREATE INDEX IF NOT EXISTS idx_events_version ON events (version);

-- Index on country for geographic queries
CREATE INDEX IF NOT EXISTS idx_events_country ON events (country) WHERE country IS NOT NULL;

-- Composite index for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_events_composite ON events (timestamp_hour DESC, tool, status);

-- GIN index for JSONB parameters (only if needed for queries)
-- CREATE INDEX IF NOT EXISTS idx_events_parameters ON events USING GIN (parameters);

-- =============================================================================
-- DAILY AGGREGATIONS TABLE
-- =============================================================================
-- Pre-computed daily metrics for fast dashboard queries
-- Retention: 730 days (2 years)

CREATE TABLE IF NOT EXISTS daily_aggregations (
  date DATE NOT NULL,
  tool TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',

  -- Call counts
  total_calls INTEGER NOT NULL DEFAULT 0,
  success_calls INTEGER NOT NULL DEFAULT 0,
  error_calls INTEGER NOT NULL DEFAULT 0,

  -- Performance metrics (milliseconds)
  avg_response_time_ms REAL,
  p50_response_time_ms REAL,  -- Median
  p95_response_time_ms REAL,
  p99_response_time_ms REAL,
  min_response_time_ms INTEGER,
  max_response_time_ms INTEGER,

  -- Cache metrics
  cache_hit_count INTEGER DEFAULT 0,
  cache_miss_count INTEGER DEFAULT 0,
  cache_hit_rate REAL,

  -- Service distribution
  noaa_calls INTEGER DEFAULT 0,
  openmeteo_calls INTEGER DEFAULT 0,

  -- Retry metrics
  total_retries INTEGER DEFAULT 0,
  avg_retry_count REAL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Primary key: unique combination of dimensions
  PRIMARY KEY (date, tool, version, country)
);

-- Indexes for daily aggregations
CREATE INDEX IF NOT EXISTS idx_daily_agg_date ON daily_aggregations (date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_agg_tool ON daily_aggregations (tool);
CREATE INDEX IF NOT EXISTS idx_daily_agg_version ON daily_aggregations (version) WHERE version IS NOT NULL;

-- =============================================================================
-- HOURLY AGGREGATIONS TABLE
-- =============================================================================
-- Real-time metrics updated more frequently
-- Retention: 30 days

CREATE TABLE IF NOT EXISTS hourly_aggregations (
  hour TIMESTAMPTZ NOT NULL,
  tool TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',

  -- Call counts
  total_calls INTEGER NOT NULL DEFAULT 0,
  success_calls INTEGER NOT NULL DEFAULT 0,
  error_calls INTEGER NOT NULL DEFAULT 0,

  -- Performance metrics
  avg_response_time_ms REAL,
  p95_response_time_ms REAL,

  -- Cache metrics
  cache_hit_rate REAL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (hour, tool, version)
);

-- Convert to hypertable for efficient time-based queries
SELECT create_hypertable('hourly_aggregations', 'hour', if_not_exists => TRUE);

-- Index for recent data queries
CREATE INDEX IF NOT EXISTS idx_hourly_agg_hour ON hourly_aggregations (hour DESC);
CREATE INDEX IF NOT EXISTS idx_hourly_agg_tool ON hourly_aggregations (tool);

-- =============================================================================
-- ERROR SUMMARY TABLE
-- =============================================================================
-- Aggregated error tracking for monitoring
-- Retention: 90 days

CREATE TABLE IF NOT EXISTS error_summary (
  hour TIMESTAMPTZ NOT NULL,
  tool TEXT NOT NULL,
  error_type TEXT NOT NULL,

  -- Error counts and timing
  count INTEGER NOT NULL DEFAULT 0,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,

  -- Additional context
  affected_versions TEXT[],  -- Array of affected version strings

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (hour, tool, error_type)
);

-- Convert to hypertable
SELECT create_hypertable('error_summary', 'hour', if_not_exists => TRUE);

-- Indexes for error queries
CREATE INDEX IF NOT EXISTS idx_error_summary_hour ON error_summary (hour DESC);
CREATE INDEX IF NOT EXISTS idx_error_summary_tool ON error_summary (tool);
CREATE INDEX IF NOT EXISTS idx_error_summary_type ON error_summary (error_type);
CREATE INDEX IF NOT EXISTS idx_error_summary_last_seen ON error_summary (last_seen DESC);

-- =============================================================================
-- SYSTEM METADATA TABLE
-- =============================================================================
-- Stores system-level information like schema version, last migration, etc.

CREATE TABLE IF NOT EXISTS system_metadata (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial schema version
INSERT INTO system_metadata (key, value)
VALUES ('schema_version', '1.0.0')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- DATA RETENTION POLICIES
-- =============================================================================
-- TimescaleDB automatically deletes old data based on these policies

-- Raw events: 90 days retention
SELECT add_retention_policy('events', INTERVAL '90 days', if_not_exists => TRUE);

-- Hourly aggregations: 30 days retention
SELECT add_retention_policy('hourly_aggregations', INTERVAL '30 days', if_not_exists => TRUE);

-- Error summary: 90 days retention
SELECT add_retention_policy('error_summary', INTERVAL '90 days', if_not_exists => TRUE);

-- =============================================================================
-- COMPRESSION POLICIES (Optional - saves disk space)
-- =============================================================================
-- Compress old data to save space while keeping it queryable
-- Note: Compression requires columnstore to be enabled first

-- Enable compression on events table
ALTER TABLE events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tool,status'
);

-- Compress events older than 7 days
SELECT add_compression_policy('events', INTERVAL '7 days', if_not_exists => TRUE);

-- Enable compression on hourly_aggregations table
ALTER TABLE hourly_aggregations SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tool'
);

-- Compress hourly aggregations older than 3 days
SELECT add_compression_policy('hourly_aggregations', INTERVAL '3 days', if_not_exists => TRUE);

-- Enable compression on error_summary table
ALTER TABLE error_summary SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tool,error_type'
);

-- Compress error summary older than 7 days
SELECT add_compression_policy('error_summary', INTERVAL '7 days', if_not_exists => TRUE);

-- =============================================================================
-- CONTINUOUS AGGREGATES (Optional - for real-time dashboards)
-- =============================================================================
-- These are materialized views that are automatically updated

-- Uncomment if you want automatic hourly aggregation from events
-- This is handled by the worker process instead for more control

/*
CREATE MATERIALIZED VIEW hourly_event_summary
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) AS hour,
  tool,
  version,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE status = 'success') as success_calls,
  COUNT(*) FILTER (WHERE status = 'error') as error_calls,
  AVG(response_time_ms) as avg_response_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms
FROM events
GROUP BY hour, tool, version;

SELECT add_continuous_aggregate_policy('hourly_event_summary',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);
*/

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to calculate success rate
CREATE OR REPLACE FUNCTION calculate_success_rate(success_count INTEGER, total_count INTEGER)
RETURNS REAL AS $$
BEGIN
  IF total_count = 0 THEN
    RETURN 0.0;
  END IF;
  RETURN (success_count::REAL / total_count::REAL);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at columns
CREATE TRIGGER update_daily_agg_updated_at BEFORE UPDATE ON daily_aggregations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hourly_agg_updated_at BEFORE UPDATE ON hourly_aggregations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_error_summary_updated_at BEFORE UPDATE ON error_summary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SCHEMA COMPLETE
-- =============================================================================
-- Schema version: 1.0.0
-- TimescaleDB features: hypertables, retention policies, compression
-- Estimated disk usage: ~10GB for 1M events with 90-day retention
