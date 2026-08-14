"use client";

import { useState, useTransition } from "react";
import { updateRecommendationStatus } from "@/app/induction/actions";
import type { RecommendationRow } from "@/app/induction/queries";

const STATUSES = ["New", "In Progress", "Implemented", "Verified"] as const;

const PRIORITY_CLASSES: Record<string, string> = {
  High: "bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-200",
  Medium: "bg-yellow-200 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
  Low: "bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200",
};

export function RecommendationsBoard({
  recommendations,
}: {
  recommendations: RecommendationRow[];
}) {
  const [recs, setRecs] = useState(recommendations);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const handleStatusChange = (
    id: number,
    newStatus: (typeof STATUSES)[number],
  ) => {
    setPendingId(id);
    setRecs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)),
    );

    startTransition(async () => {
      await updateRecommendationStatus(id, newStatus);
      setPendingId(null);
    });
  };

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-900 p-6 shadow">
      <h3 className="mb-6 text-lg font-semibold">Recommendations Board</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((status) => (
          <div key={status} className="rounded-lg bg-gray-50 dark:bg-slate-800 p-4">
            <p className="mb-4 text-sm font-semibold">{status}</p>
            <div className="space-y-3">
              {recs
                .filter((r) => r.status === status)
                .map((rec) => (
                  <div
                    key={rec.id}
                    className={`rounded-lg border bg-white dark:bg-slate-900 p-3 ${
                      pendingId === rec.id ? "opacity-60" : ""
                    }`}
                  >
                    <p className="text-sm font-semibold">{rec.title}</p>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{rec.evidence}</p>
                    <span
                      className={`mt-2 inline-block rounded px-2 py-1 text-xs font-semibold ${
                        PRIORITY_CLASSES[rec.priority] ?? "bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-slate-200"
                      }`}
                    >
                      {rec.priority}
                    </span>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleStatusChange(rec.id, s)}
                          disabled={pendingId === rec.id || rec.status === s}
                          className={`rounded px-2 py-1 text-xs ${
                            rec.status === s
                              ? "bg-blue-600 text-white"
                              : "bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-600"
                          } disabled:cursor-not-allowed`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              {recs.filter((r) => r.status === status).length === 0 && (
                <p className="text-xs text-gray-400">No items.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
