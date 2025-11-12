import type { ErrorStats } from '../types';

interface ErrorsProps {
  errors: ErrorStats[];
}

export default function Errors({ errors }: ErrorsProps) {
  if (errors.length === 0) {
    return (
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Error Statistics</h2>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-gray-500">No errors recorded in this period. 🎉</p>
        </div>
      </section>
    );
  }

  const totalErrors = errors.reduce((sum, e) => sum + e.count, 0);

  return (
    <section>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Error Statistics</h2>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-6">
          <div className="text-3xl font-bold text-red-600 mb-1">
            {new Intl.NumberFormat('en-US').format(totalErrors)}
          </div>
          <div className="text-sm text-gray-600">Total Errors</div>
        </div>

        <div className="space-y-4">
          {errors.map((error) => (
            <div key={error.type} className="border-l-4 border-red-400 bg-red-50 p-4 rounded-r-lg">
              <div className="flex items-start justify-between">
                <div className="flex-grow">
                  <h4 className="text-lg font-semibold text-gray-900">{error.type}</h4>
                  <div className="mt-2 flex items-center gap-6 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Count:</span>{' '}
                      {new Intl.NumberFormat('en-US').format(error.count)}
                    </div>
                    <div>
                      <span className="font-medium">Percentage:</span>{' '}
                      {(error.percentage * 100).toFixed(1)}%
                    </div>
                    {error.last_seen && (
                      <div>
                        <span className="font-medium">Last seen:</span>{' '}
                        {new Date(error.last_seen).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-4">
                  <div className="relative pt-1">
                    <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-red-200" style={{ width: '120px' }}>
                      <div
                        style={{ width: `${error.percentage * 100}%` }}
                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-red-600"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
