// API Response Types
export interface StatsOverview {
  period: string;
  start_date: string;
  end_date: string;
  summary: {
    total_calls: number;
    unique_versions: number;
    active_installs: number;
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

export interface PerformanceStats {
  period: string;
  response_times: {
    avg_ms: number;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
  };
  cache_performance: {
    hit_rate: number;
    total_hits: number;
    total_misses: number;
  };
  service_distribution: {
    noaa: number;
    openmeteo: number;
  };
}

export type TimePeriod = '7d' | '30d' | '90d';
