"use client";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Clean dependency-free SVG donut chart. Renders segments via stroke-dasharray
 * on stacked circles and shows the total in the center. Light-theme friendly.
 */
export default function DonutChart({
  data,
  size = 128,
  thickness = 14,
  onSliceClick,
  centerLabel = "TASKS",
}: {
  data: DonutSegment[];
  size?: number;
  thickness?: number;
  onSliceClick?: (label: string) => void;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${total} ${centerLabel.toLowerCase()} by status`}
      className="shrink-0"
    >
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const seg = (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                onClick={onSliceClick ? () => onSliceClick(d.label) : undefined}
                style={onSliceClick ? { cursor: "pointer" } : undefined}
              >
                {onSliceClick && <title>{`${d.label}: ${d.value}`}</title>}
              </circle>
            );
            offset += len;
            return seg;
          })}
      </g>
      <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.24} fontWeight={700} className="fill-slate-900">
        {total}
      </text>
      <text x={cx} y={cy + size * 0.15} textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.085} className="fill-slate-400" letterSpacing="0.08em">
        {centerLabel}
      </text>
    </svg>
  );
}
