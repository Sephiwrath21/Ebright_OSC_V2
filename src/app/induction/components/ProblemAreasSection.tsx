import type { ProblemArea } from "@/app/induction/queries";

export function ProblemAreasSection({ areas }: { areas: ProblemArea[] }) {
  if (areas.length === 0) {
    return (
      <div className="rounded-lg border bg-white dark:bg-slate-900 p-6 shadow">
        <h3 className="text-lg font-semibold">Problem Areas</h3>
        <p className="mt-2 text-gray-600 dark:text-gray-400">No issues detected.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-900 p-6 shadow">
      <h3 className="mb-4 text-lg font-semibold">Problem Areas</h3>
      <div className="space-y-3">
        {areas.map((area) => (
          <div
            key={area.metricName}
            className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900 p-4"
          >
            <p className="font-semibold text-red-900 dark:text-red-200">{area.metricName}</p>
            <p className="mt-1 text-sm text-red-800 dark:text-red-300">{area.evidence}</p>
            <p className="mt-2 text-xs text-red-700 dark:text-red-400">
              Score: {area.currentScore}/100
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
