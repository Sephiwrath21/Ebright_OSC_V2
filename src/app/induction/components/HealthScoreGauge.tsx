export function HealthScoreGauge({ score }: { score: number }) {
  const safeScore = Math.max(0, Math.min(100, score));

  const color =
    safeScore < 60 ? "#ef4444" : safeScore < 80 ? "#eab308" : "#22c55e";
  const label =
    safeScore < 60 ? "↓ Needs improvement" : safeScore < 80 ? "→ On track" : "↑ Excellent";

  const circumference = 2 * Math.PI * 45;
  const dash = (safeScore / 100) * circumference;

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-900 p-6 text-center shadow">
      <h3 className="mb-6 text-lg font-semibold">Induction Health Score</h3>

      <div className="relative mx-auto h-40 w-40">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--status-track)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold">{safeScore}%</span>
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">{label}</p>
    </div>
  );
}
