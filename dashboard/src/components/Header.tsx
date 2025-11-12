import type { TimePeriod } from '../types';

interface HeaderProps {
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
}

export default function Header({ period, onPeriodChange, autoRefresh, onToggleAutoRefresh }: HeaderProps) {
  const periods: { value: TimePeriod; label: string }[] = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
  ];

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Weather MCP Analytics</h1>
            <p className="text-sm text-gray-600 mt-1">Privacy-first usage statistics</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2">
              {periods.map((p) => (
                <button
                  key={p.value}
                  onClick={() => onPeriodChange(p.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    period === p.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              onClick={onToggleAutoRefresh}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                autoRefresh
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {autoRefresh ? '● Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
