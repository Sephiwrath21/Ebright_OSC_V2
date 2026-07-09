"use client";

import { Chart as ChartJS, ArcElement, Tooltip, Legend, type ChartOptions } from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Chart.js doughnut of the raw ClickUp status breakdown. Tooltips show
 * "status: count (pct%)"; clicking a slice calls onSliceClick(label).
 */
export default function StatusDonut({
  data,
  size = 120,
  onSliceClick,
}: {
  data: DonutSegment[];
  size?: number;
  onSliceClick?: (label: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  const chartData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        data: data.map((d) => d.value),
        backgroundColor: data.map((d) => d.color || "#94a3b8"),
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "62%",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed;
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            return `${ctx.label}: ${value} (${pct}%)`;
          },
        },
      },
    },
    onClick: (_evt, elements) => {
      if (onSliceClick && elements.length > 0) {
        const idx = elements[0].index;
        onSliceClick(data[idx].label);
      }
    },
  };

  return (
    <div style={{ width: size, height: size }} className="shrink-0">
      <Doughnut data={chartData} options={options} aria-label={`${total} tasks by status`} role="img" />
    </div>
  );
}
