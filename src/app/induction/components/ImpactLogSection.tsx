import type { ImpactLogRow } from "@/app/induction/queries";

export function ImpactLogSection({ logs }: { logs: ImpactLogRow[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border bg-white dark:bg-slate-900 p-6 shadow">
        <h3 className="text-lg font-semibold">Impact Log</h3>
        <p className="mt-2 text-gray-600 dark:text-gray-400">No improvements tracked yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-900 p-6 shadow">
      <h3 className="mb-6 text-lg font-semibold">Impact Timeline</h3>
      <div className="space-y-4">
        {logs.map((log, idx) => (
          <div
            key={`${log.recommendationTitle}-${idx}`}
            className="border-l-4 border-green-600 dark:border-green-500 py-2 pl-4"
          >
            <p className="font-semibold">{log.recommendationTitle}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{log.metricName}</p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <span className="text-red-600 dark:text-red-400">
                Before: {log.beforeValue.toFixed(1)}
              </span>
              <span className="text-green-600 dark:text-green-400">
                After: {log.afterValue.toFixed(1)}
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                +{log.improvementPercentage.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{log.measuredAt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
