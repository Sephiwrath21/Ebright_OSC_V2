"use client";

import * as React from "react";
import type { ActionResult, FlowTaskRow, ProofRemoveHandler, ProofUploadHandler } from "./types";
import { ResizableTaskList } from "./bits";

export interface MyWeekDay {
  weekday: string;
  date: string;
  tasks: FlowTaskRow[];
}

export function MyWeekView({
  days,
  myUserId,
  onComplete,
  onUploadProof,
  onRemoveProof,
}: {
  days: MyWeekDay[];
  myUserId: string;
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  onUploadProof?: ProofUploadHandler;
  onRemoveProof?: ProofRemoveHandler;
}) {
  const [selectedDate, setSelectedDate] = React.useState(days[0]?.date);
  const selectedDay = days.find((d) => d.date === selectedDate) ?? days[0];

  return (
    <div className="flex gap-6">
      <div className="w-48 shrink-0">
        {days.map((d) => {
          const pendingCount = d.tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIPPED").length;
          const active = d.date === selectedDay?.date;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{d.weekday}</span>
              <span className={active ? "text-blue-100" : "text-gray-400"}>{pendingCount}</span>
            </button>
          );
        })}
      </div>
      <div className="min-w-0 flex-1">
        {selectedDay && (
          <ResizableTaskList
            key={selectedDay.date}
            tasks={selectedDay.tasks}
            myUserId={myUserId}
            onComplete={onComplete}
            onUploadProof={onUploadProof}
            onRemoveProof={onRemoveProof}
            emptyLabel={`No tasks for ${selectedDay.weekday}.`}
            hideCompleted
          />
        )}
      </div>
    </div>
  );
}
