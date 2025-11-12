import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getPerformanceStats } from '../api';
import type { PerformanceStats, TimePeriod } from '../types';

interface PerformanceProps {
  period: TimePeriod;
}

export default function Performance({ period }: PerformanceProps) {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await getPerformanceStats(period);
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch performance stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period]);

  if (loading || !stats) {
    return (
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Performance</h2>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-gray-500">Loading performance data...</p>
        </div>
      </section>
    );
  }

  const responseTimeData = [
    { name: 'Average', value: Math.round(stats.response_times.avg_ms) },
    { name: 'p50', value: Math.round(stats.response_times.p50_ms) },
    { name: 'p95', value: Math.round(stats.response_times.p95_ms) },
    { name: 'p99', value: Math.round(stats.response_times.p99_ms) },
  ];

  const serviceData = [
    { name: 'NOAA', value: stats.service_distribution.noaa, color: '#3b82f6' },
    { name: 'OpenMeteo', value: stats.service_distribution.openmeteo, color: '#10b981' },
  ];

  const cacheData = [
    { name: 'Cache Hits', value: stats.cache_performance.total_hits, color: '#22c55e' },
    { name: 'Cache Misses', value: stats.cache_performance.total_misses, color: '#ef4444' },
  ];

  return (
    <section>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Performance Metrics</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Response Times */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Response Time Percentiles</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={responseTimeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#8b5cf6" name="Response Time (ms)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cache Performance */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cache Performance</h3>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={cacheData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {cacheData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 text-center">
              <div className="text-3xl font-bold text-gray-900">
                {(stats.cache_performance.hit_rate * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Cache Hit Rate</div>
            </div>
          </div>
        </div>

        {/* Service Distribution */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Weather Service Distribution</h3>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={serviceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(1)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {serviceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-8 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {new Intl.NumberFormat('en-US').format(stats.service_distribution.noaa)}
                </div>
                <div className="text-sm text-gray-600">NOAA Requests</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {new Intl.NumberFormat('en-US').format(stats.service_distribution.openmeteo)}
                </div>
                <div className="text-sm text-gray-600">OpenMeteo Requests</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
