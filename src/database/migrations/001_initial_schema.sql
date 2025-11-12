-- Migration: 001_initial_schema
-- Description: Initial database schema with TimescaleDB hypertables
-- Date: 2025-11-11

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- =============================================================================
-- EVENTS TABLE (Raw Events - Hypertable)
-- =============================================================================
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamp_hour TIMESTAMPTZ NOT NULL,
  version TEXT NOT NULL,
  tool TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  analytics_level TEXT NOT NULL CHECK (analytics_level IN ('minimal', 'standard', 'detailed')),
  response_time_ms INTEGER CHECK (response_time_ms >= 0 AND response_time_ms <= 120000),
  service TEXT,
  cache_hit BOOLEAN,
  retry_count INTEGER CHECK (retry_count >= 0 AND retry_count <= 10),
  country TEXT,
  parameters JSONB,
  session_id TEXT,
  sequence_number INTEGER CHECK (sequence_number >= 0),
  error_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (timestamp, id)
);

SELECT create_hypertable('events', 'timestamp', if_not_exists => TRUE);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_timestamp_hour ON events (timestamp_hour DESC);
CREATE INDEX IF NOT EXISTS idx_events_tool ON events (tool);
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_version ON events (version);
CREATE INDEX IF NOT EXISTS idx_events_country ON events (country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_composite ON events (timestamp_hour DESC, tool, status);

-- =============================================================================
-- DAILY AGGREGATIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS daily_aggregations (
  date DATE NOT NULL,
  tool TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  total_calls INTEGER NOT NULL DEFAULT 0,
  success_calls INTEGER NOT NULL DEFAULT 0,
  error_calls INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms REAL,
  p50_response_time_ms REAL,
  p95_response_time_ms REAL,
  p99_response_time_ms REAL,
  min_response_time_ms INTEGER,
  max_response_time_ms INTEGER,
  cache_hit_count INTEGER DEFAULT 0,
  cache_miss_count INTEGER DEFAULT 0,
  cache_hit_rate REAL,
  noaa_calls INTEGER DEFAULT 0,
  openmeteo_calls INTEGER DEFAULT 0,
  total_retries INTEGER DEFAULT 0,
  avg_retry_count REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, tool, version, country)
);

CREATE INDEX IF NOT EXISTS idx_daily_agg_date ON daily_aggregations (date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_agg_tool ON daily_aggregations (tool);
CREATE INDEX IF NOT EXISTS idx_daily_agg_version ON daily_aggregations (version) WHERE version IS NOT NULL;

-- =============================================================================
-- HOURLY AGGREGATIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS hourly_aggregations (
  hour TIMESTAMPTZ NOT NULL,
  tool TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  total_calls INTEGER NOT NULL DEFAULT 0,
  success_calls INTEGER NOT NULL DEFAULT 0,
  error_calls INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms REAL,
  p95_response_time_ms REAL,
  cache_hit_rate REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hour, tool, version)
);

SELECT create_hypertable('hourly_aggregations', 'hour', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_hourly_agg_hour ON hourly_aggregations (hour DESC);
CREATE INDEX IF NOT EXISTS idx_hourly_agg_tool ON hourly_aggregations (tool);

-- =============================================================================
-- ERROR SUMMARY TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS error_summary (
  hour TIMESTAMPTZ NOT NULL,
  tool TEXT NOT NULL,
  error_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  affected_versions TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hour, tool, error_type)
);

SELECT create_hypertable('error_summary', 'hour', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_error_summary_hour ON error_summary (hour DESC);
CREATE INDEX IF NOT EXISTS idx_error_summary_tool ON error_summary (tool);
CREATE INDEX IF NOT EXISTS idx_error_summary_type ON error_summary (error_type);
CREATE INDEX IF NOT EXISTS idx_error_summary_last_seen ON error_summary (last_seen DESC);

-- =============================================================================
-- RETENTION POLICIES
-- =============================================================================
SELECT add_retention_policy('events', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('hourly_aggregations', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('error_summary', INTERVAL '90 days', if_not_exists => TRUE);

-- =============================================================================
-- COMPRESSION POLICIES
-- =============================================================================
ALTER TABLE events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tool,status'
);
SELECT add_compression_policy('events', INTERVAL '7 days', if_not_exists => TRUE);

ALTER TABLE hourly_aggregations SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tool'
);
SELECT add_compression_policy('hourly_aggregations', INTERVAL '3 days', if_not_exists => TRUE);

ALTER TABLE error_summary SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tool,error_type'
);
SELECT add_compression_policy('error_summary', INTERVAL '7 days', if_not_exists => TRUE);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================
CREATE OR REPLACE FUNCTION calculate_success_rate(success_count INTEGER, total_count INTEGER)
RETURNS REAL AS $$
BEGIN
  IF total_count = 0 THEN
    RETURN 0.0;
  END IF;
  RETURN (success_count::REAL / total_count::REAL);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers (drop first to ensure idempotency)
DROP TRIGGER IF EXISTS update_daily_agg_updated_at ON daily_aggregations;
CREATE TRIGGER update_daily_agg_updated_at BEFORE UPDATE ON daily_aggregations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hourly_agg_updated_at ON hourly_aggregations;
CREATE TRIGGER update_hourly_agg_updated_at BEFORE UPDATE ON hourly_aggregations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_error_summary_updated_at ON error_summary;
CREATE TRIGGER update_error_summary_updated_at BEFORE UPDATE ON error_summary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
