"use client";

export default function ClickUpPieChart({
  distribution,
  onSliceClick,
}: {
  distribution: {
    PENDING: number;
    COMPLETE: number;
    "NOT APPLICABLE": number;
    "N/A": number;
  };
  onSliceClick: (status: string) => void;
}) {
  const data = [
    { label: "PENDING", value: distribution.PENDING, color: "#EF4444" },
    { label: "NOT APPLICABLE", value: distribution["NOT APPLICABLE"], color: "#EAB308" },
    { label: "N/A", value: distribution["N/A"], color: "#F59E0B" },
    { label: "COMPLETE", value: distribution.COMPLETE, color: "#10B981" },
  ];

  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-xs font-medium">
        No daily tasks found.
      </div>
    );
  }

  const size = 300;
  const center = size / 2;
  const radius = 64;

  let currentPercent = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const startPercent = currentPercent;
      const percent = d.value / total;
      currentPercent += percent;

      const startAngle = startPercent * 2 * Math.PI - Math.PI / 2;
      const endAngle = currentPercent * 2 * Math.PI - Math.PI / 2;

      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      const largeArcFlag = percent > 0.5 ? 1 : 0;
      const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

      // Midpoint angle for pointing labels
      const midAngle = (startAngle + endAngle) / 2;
      const lx1 = center + radius * Math.cos(midAngle);
      const ly1 = center + radius * Math.sin(midAngle);
      const lx2 = center + (radius + 20) * Math.cos(midAngle);
      const ly2 = center + (radius + 20) * Math.sin(midAngle);
      
      const isLeft = Math.cos(midAngle) < 0;
      const lx3 = lx2 + (isLeft ? -15 : 15);
      const ly3 = ly2;

      return {
        label: d.label,
        value: d.value,
        color: d.color,
        path,
        linePoints: `${lx1},${ly1} ${lx2},${ly2} ${lx3},${ly3}`,
        textX: lx3 + (isLeft ? -5 : 5),
        textY: ly3 + 4,
        textAnchor: isLeft ? "end" : "start",
      };
    });

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-full max-w-[280px] aspect-square flex items-center justify-center">
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
          {/* Pie Slices */}
          {slices.map((s, i) => (
            <path
              key={i}
              d={s.path}
              fill={s.color}
              className="transition-all duration-300 hover:opacity-85 cursor-pointer"
              onClick={() => onSliceClick(s.label)}
            />
          ))}

          {/* Pointer Lines & Labels */}
          {slices.map((s, i) => (
            <g key={`lbl-${i}`}>
              <polyline
                points={s.linePoints}
                fill="none"
                stroke={s.color}
                strokeWidth="1"
                opacity="0.8"
              />
              <text
                x={s.textX}
                y={s.textY}
                fill="#334155"
                fontSize="9"
                fontWeight="700"
                textAnchor={s.textAnchor}
                className="font-mono tracking-tight cursor-pointer hover:underline"
                onClick={() => onSliceClick(s.label)}
              >
                {s.label} {s.value}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Custom Legend */}
      <div className="flex justify-center gap-x-3 gap-y-1.5 text-[9px] font-bold text-slate-500 mt-2 flex-wrap max-w-xs uppercase tracking-wider">
        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-800" onClick={() => onSliceClick("PENDING")}>
          <span className="w-2 h-2 bg-[#EF4444] rounded-sm" /> PENDING
        </div>
        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-800" onClick={() => onSliceClick("NOT APPLICABLE")}>
          <span className="w-2 h-2 bg-[#EAB308] rounded-sm" /> NOT APPLICABLE
        </div>
        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-800" onClick={() => onSliceClick("N/A")}>
          <span className="w-2 h-2 bg-[#F59E0B] rounded-sm" /> N/A
        </div>
        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-800" onClick={() => onSliceClick("COMPLETE")}>
          <span className="w-2 h-2 bg-[#10B981] rounded-sm" /> COMPLETE
        </div>
      </div>
    </div>
  );
}
