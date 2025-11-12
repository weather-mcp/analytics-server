import { useState, useEffect } from 'react';
import { getStatsOverview } from './api';
import type { StatsOverview, TimePeriod } from './types';
import Header from './components/Header';
import Footer from './components/Footer';
import Overview from './components/Overview';
import ToolUsage from './components/ToolUsage';
import Performance from './components/Performance';
import Errors from './components/Errors';
import LoadingSpinner from './components/LoadingSpinner';

function App() {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getStatsOverview(period);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [period]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchStats();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, period]);

  const handlePeriodChange = (newPeriod: TimePeriod) => {
    setPeriod(newPeriod);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header
        period={period}
        onPeriodChange={handlePeriodChange}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={toggleAutoRefresh}
      />

      <main className="flex-grow container mx-auto px-4 py-8 max-w-7xl">
        {loading && !stats && (
          <LoadingSpinner />
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <p className="font-medium">Error loading statistics</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={fetchStats}
              className="mt-2 text-sm underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {stats && (
          <div className="space-y-8">
            <Overview summary={stats.summary} period={stats.period} />
            <ToolUsage tools={stats.tools} />
            <Performance period={period} />
            <Errors errors={stats.errors} />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default App;
