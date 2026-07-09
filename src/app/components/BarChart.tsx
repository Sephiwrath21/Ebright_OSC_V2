"use client";

export interface BarSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface BarDatum {
  label: string;
  value: number;
  color: string;
  /** Optional secondary metric shown next to the value (e.g. a count). */
  meta?: string;
  /** Stable key used for click handling / filtering. */
  key?: string;
  /**
   * Optional breakdown rendered as a stacked bar. Segment values should sum to
   * `value`. When present, segments replace the single-color fill.
   */
  segments?: BarSegment[];
}

/**
 * Dependency-free horizontal bar chart. Light-theme friendly, sized to its
 * container. Bars are drawn as plain divs so labels wrap and align cleanly
 * regardless of how many categories there are. Rows are clickable when
 * onBarClick is provided, mirroring DonutChart's interaction.
 */
export default function BarChart({
  data,
  valueFormatter = (v) => String(v),
  activeKey,
  onBarClick,
}: {
  data: BarDatum[];
  valueFormatter?: (value: number) => string;
  activeKey?: string;
  onBarClick?: (key: string) => void;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);

  return (
    <ul className="flex flex-col gap-3" role="list">
      {data.map((d, i) => {
        const pct = max > 0 ? (d.value / max) * 100 : 0;
        const k = d.key ?? d.label;
        const isActive = activeKey === k;
        const interactive = !!onBarClick;
        return (
          <li key={i}>
            <button
              type="button"
              disabled={!interactive}
              onClick={interactive ? () => onBarClick!(k) : undefined}
              aria-pressed={interactive ? isActive : undefined}
              className={`group w-full text-left rounded-lg px-1.5 py-1 transition-colors ${
                interactive
                  ? "hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400 cursor-pointer"
                  : "cursor-default"
              } ${isActive ? "bg-slate-50" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span
                  className={`text-sm truncate ${
                    isActive ? "font-semibold text-slate-900" : "font-medium text-slate-600"
                  }`}
                >
                  {d.label}
                </span>
                <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
                  <span className="text-sm font-bold text-slate-900">
                    {valueFormatter(d.value)}
                  </span>
                  {d.meta && <span className="text-xs text-slate-400">{d.meta}</span>}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                {d.segments && d.segments.length > 0 ? (
                  d.segments.map((seg) => (
                    <div
                      key={seg.key}
                      title={`${seg.label}: ${seg.value}`}
                      className="h-full transition-all"
                      style={{
                        width: `${max > 0 ? (seg.value / max) * 100 : 0}%`,
                        backgroundColor: seg.color,
                      }}
                    />
                  ))
                ) : (
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(pct, d.value > 0 ? 4 : 0)}%`,
                      backgroundColor: d.color,
                    }}
                  />
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
