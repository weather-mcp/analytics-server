import type { StatsOverview, ToolStats, ErrorStats, PerformanceStats, TimePeriod } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function fetchAPI<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  return response.json();
}

export async function getStatsOverview(period: TimePeriod = '30d'): Promise<StatsOverview> {
  return fetchAPI<StatsOverview>(`/v1/stats/overview?period=${period}`);
}

export async function getToolsStats(period: TimePeriod = '30d'): Promise<{ period: string; tools: ToolStats[] }> {
  return fetchAPI(`/v1/stats/tools?period=${period}`);
}

export async function getErrorStats(period: TimePeriod = '30d'): Promise<{ period: string; errors: ErrorStats[] }> {
  return fetchAPI(`/v1/stats/errors?period=${period}`);
}

export async function getPerformanceStats(period: TimePeriod = '30d'): Promise<PerformanceStats> {
  return fetchAPI<PerformanceStats>(`/v1/stats/performance?period=${period}`);
}
