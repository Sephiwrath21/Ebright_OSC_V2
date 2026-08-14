"use client";

// OSC integration package — the dashboard "Task Progress" card. Sits alongside
// the To-Do List card on the OSC home: overview ONLY (donut + Daily/Monthly
// toggle + assigner streams: CEO assigned / HOD assigned / ad-hoc). Details
// live behind the ClickUp Tasks page (detailHref).
//
// Server side fetches both periods (getFlowOverview) and passes them in, so
// the toggle is instant — no client fetch, no secret in the browser.

import * as React from "react";
import type { FlowOverviewResponse, FlowPeriod } from "./types";
import { flowBucketTotal, flowStreamLabel, visibleAssignerStreams } from "./types";
import { BucketLegend, CompletionMeter, StatusDonut } from "./bits";

export function TaskProgressCard({
  daily,
  monthly,
  detailHref = "/task-manager",
}: {
  daily: FlowOverviewResponse;
  monthly: FlowOverviewResponse;
  detailHref?: string;
}) {
  const [period, setPeriod] = React.useState<FlowPeriod>("daily");
  const data = period === "daily" ? daily : monthly;
  const total = flowBucketTotal(data.totals);
  // Admin/Ops assigned tasks don't get their own stream meter here either —
  // same "no special Admin Assigned Task category" rule as the ClickUp
  // Tasks page (visibleAssignerStreams, osc/types.ts).
  const streams = visibleAssignerStreams(data.streams);

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">
          Task Progress
        </h3>
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium dark:bg-slate-800">
          {(["daily", "monthly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 capitalize transition-colors ${
                period === p
                  ? "bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-gray-500 dark:text-slate-400"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {total === 0 && !data.delegated ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-slate-400">
          No tasks for this {period === "daily" ? "day" : "month"}.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-6">
            <StatusDonut totals={data.totals} size={116}>
              <span className="text-2xl font-bold text-gray-900 dark:text-slate-100">{total}</span>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-slate-400">
                tasks
              </span>
            </StatusDonut>
            <div className="min-w-0 flex-1">
              <BucketLegend totals={data.totals} />
            </div>
          </div>

          {(streams.length > 0 || data.delegated) && (
            <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-slate-800">
              {streams.map((stream) => {
                const streamTotal = flowBucketTotal(stream.totals);
                return (
                  <div key={stream.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-gray-600 dark:text-slate-300">
                        {flowStreamLabel(stream.key)}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400 dark:text-slate-400">
                        {stream.totals.completed}/{streamTotal} done
                      </span>
                    </div>
                    <CompletionMeter
                      done={stream.totals.completed}
                      total={streamTotal}
                    />
                  </div>
                );
              })}
              {data.delegated && (
                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-gray-600 dark:text-slate-300">
                      Assigned by me
                    </span>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-slate-400">
                      {data.delegated.totals.completed}/
                      {flowBucketTotal(data.delegated.totals)} done
                    </span>
                  </div>
                  <CompletionMeter
                    done={data.delegated.totals.completed}
                    total={flowBucketTotal(data.delegated.totals)}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      <a
        href={detailHref}
        className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      >
        View details →
      </a>
    </div>
  );
}
