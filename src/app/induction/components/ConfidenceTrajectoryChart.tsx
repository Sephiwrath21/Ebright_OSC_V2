import type { ConfidencePoint } from "@/app/induction/queries";

const LABEL_MAP: Record<string, string> = {
  Day1: "Day 1",
  Week2: "Week 2",
  Month1: "Month 1",
  Month3: "Month 3",
};

export function ConfidenceTrajectoryChart({ data }: { data: ConfidencePoint[] }) {
  const width = 600;
  const height = 280;
  const padding = { top: 20, right: 24, bottom: 40, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const yMin = 1;
  const yMax = 5;

  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const yScale = (v: number) =>
    innerH - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * innerH;

  const points = data.map((d, i) => ({
    x: padding.left + i * xStep,
    y: padding.top + yScale(d.averageScore || yMin),
    label: LABEL_MAP[d.milestone] ?? d.milestone,
    value: d.averageScore,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-900 p-6 shadow">
      <h3 className="mb-6 text-lg font-semibold">Confidence Trajectory</h3>

      {data.length === 0 || data.every((d) => d.averageScore === 0) ? (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">
          No survey responses yet.
        </p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
          {[1, 2, 3, 4, 5].map((tick) => {
            const y = padding.top + yScale(tick);
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="var(--status-track)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-gray-500 dark:fill-gray-400 text-xs"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} />

          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={4} fill="#3b82f6" />
              <text
                x={p.x}
                y={height - padding.bottom + 18}
                textAnchor="middle"
                className="fill-gray-700 dark:fill-gray-300 text-xs"
              >
                {p.label}
              </text>
              <text
                x={p.x}
                y={p.y - 8}
                textAnchor="middle"
                className="fill-gray-700 dark:fill-gray-300 text-xs font-semibold"
              >
                {p.value.toFixed(1)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
