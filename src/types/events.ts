// Event Types for Analytics System
// These types match the database schema and validation logic

export type AnalyticsLevel = 'minimal' | 'standard' | 'detailed';
export type EventStatus = 'success' | 'error';
export type ServiceType = 'noaa' | 'openmeteo';

// Base event interface (minimal level)
export interface MinimalEvent {
  version: string;
  tool: string;
  status: EventStatus;
  timestamp_hour: string; // ISO 8601 datetime string
  analytics_level: 'minimal';
}

// Standard level event (includes performance metrics)
export interface StandardEvent extends MinimalEvent {
  analytics_level: 'standard';
  response_time_ms?: number;
  service?: ServiceType;
  cache_hit?: boolean;
  retry_count?: number;
  country?: string; // ISO 3166-1 alpha-2
  error_type?: string; // Only present if status is 'error'
}

// Detailed level event (includes session tracking)
export interface DetailedEvent extends StandardEvent {
  analytics_level: 'detailed';
  parameters?: Record<string, unknown>; // Anonymized parameters
  session_id?: string; // Hashed session identifier
  sequence_number?: number;
}

// Union type for all event types
export type AnalyticsEvent = MinimalEvent | StandardEvent | DetailedEvent;

// Database event record (includes auto-generated fields)
export interface EventRecord {
  id: number;
  timestamp: Date;
  timestamp_hour: Date;
  version: string;
  tool: string;
  status: EventStatus;
  analytics_level: AnalyticsLevel;
  response_time_ms?: number | null;
  service?: ServiceType | null;
  cache_hit?: boolean | null;
  retry_count?: number | null;
  country?: string | null;
  parameters?: Record<string, unknown> | null;
  session_id?: string | null;
  sequence_number?: number | null;
  error_type?: string | null;
  created_at: Date;
}

// Daily aggregation record
export interface DailyAggregation {
  date: Date;
  tool: string;
  version: string;
  country: string;
  total_calls: number;
  success_calls: number;
  error_calls: number;
  avg_response_time_ms?: number | null;
  p50_response_time_ms?: number | null;
  p95_response_time_ms?: number | null;
  p99_response_time_ms?: number | null;
  min_response_time_ms?: number | null;
  max_response_time_ms?: number | null;
  cache_hit_count: number;
  cache_miss_count: number;
  cache_hit_rate?: number | null;
  noaa_calls: number;
  openmeteo_calls: number;
  total_retries: number;
  avg_retry_count?: number | null;
  created_at: Date;
  updated_at: Date;
}

// Hourly aggregation record
export interface HourlyAggregation {
  hour: Date;
  tool: string;
  version: string;
  total_calls: number;
  success_calls: number;
  error_calls: number;
  avg_response_time_ms?: number | null;
  p95_response_time_ms?: number | null;
  cache_hit_rate?: number | null;
  created_at: Date;
  updated_at: Date;
}

// Error summary record
export interface ErrorSummary {
  hour: Date;
  tool: string;
  error_type: string;
  count: number;
  first_seen: Date;
  last_seen: Date;
  affected_versions: string[];
  created_at: Date;
  updated_at: Date;
}

// API request/response types
export interface EventBatchRequest {
  events: AnalyticsEvent[];
}

export interface EventBatchResponse {
  status: 'accepted';
  count: number;
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
  details?: string | string[];
  retry_after?: number;
}

// Stats API types
export interface StatsOverview {
  period: string;
  start_date: string;
  end_date: string;
  summary: {
    total_calls: number;
    unique_versions: number;
    active_installs: number; // Estimated
    success_rate: number;
    avg_response_time_ms: number;
  };
  tools: ToolStats[];
  errors: ErrorStats[];
  cache_hit_rate: number;
}

export interface ToolStats {
  name: string;
  calls: number;
  success_rate: number;
  avg_response_time_ms: number;
  p95_response_time_ms?: number;
}

export interface ErrorStats {
  type: string;
  count: number;
  percentage: number;
  last_seen?: string;
}

// Validation result type
export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: string[];
}
