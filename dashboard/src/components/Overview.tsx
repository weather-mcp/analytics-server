interface OverviewProps {
  summary: {
    total_calls: number;
    unique_versions: number;
    active_installs: number;
    success_rate: number;
    avg_response_time_ms: number;
  };
  period: string;
}

export default function Overview({ summary, period }: OverviewProps) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatPercentage = (num: number) => {
    return `${(num * 100).toFixed(1)}%`;
  };

  const stats = [
    {
      label: 'Total API Calls',
      value: formatNumber(summary.total_calls),
      description: `In the ${period} period`,
      color: 'blue',
    },
    {
      label: 'Active Installations',
      value: formatNumber(summary.active_installs),
      description: 'Estimated active installs',
      color: 'green',
    },
    {
      label: 'Success Rate',
      value: formatPercentage(summary.success_rate),
      description: 'Successful requests',
      color: 'purple',
    },
    {
      label: 'Avg Response Time',
      value: `${Math.round(summary.avg_response_time_ms)}ms`,
      description: 'Average API latency',
      color: 'orange',
    },
    {
      label: 'Unique Versions',
      value: formatNumber(summary.unique_versions),
      description: 'Different MCP versions',
      color: 'pink',
    },
  ];

  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    orange: 'bg-orange-50 border-orange-200 text-orange-900',
    pink: 'bg-pink-50 border-pink-200 text-pink-900',
  };

  return (
    <section>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${colorClasses[stat.color as keyof typeof colorClasses]} border rounded-lg p-5`}
          >
            <div className="text-3xl font-bold mb-1">{stat.value}</div>
            <div className="font-medium text-sm mb-1">{stat.label}</div>
            <div className="text-xs opacity-75">{stat.description}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
