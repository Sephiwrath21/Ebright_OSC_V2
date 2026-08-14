"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { createBulkInductionRequests } from "@/app/induction/actions";

interface Props {
  userIds: number[];
  accent?: "emerald" | "rose";
}

const COLOR: Record<NonNullable<Props["accent"]>, { bg: string; hover: string; ring: string }> = {
  emerald: {
    bg: "bg-emerald-600",
    hover: "hover:bg-emerald-700",
    ring: "focus-visible:ring-emerald-500",
  },
  rose: {
    bg: "bg-rose-600",
    hover: "hover:bg-rose-700",
    ring: "focus-visible:ring-rose-500",
  },
};

export function BulkAddToQueueButton({ userIds, accent = "emerald" }: Props) {
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const colors = COLOR[accent];

  const handleClick = () => {
    if (userIds.length === 0 || pending || done) return;
    setPending(true);
    setMessage(null);
    startTransition(async () => {
      const result = await createBulkInductionRequests(userIds);
      setPending(false);
      if (!result.ok) {
        setMessage(result.error ?? "Failed to add employees.");
        return;
      }
      const skippedNote =
        result.skipped > 0
          ? ` (${result.skipped} skipped — already queued or invalid)`
          : "";
      setMessage(
        `Added ${result.created} employee${result.created !== 1 ? "s" : ""} to the induction queue${skippedNote}.`,
      );
      setDone(true);
    });
  };

  const disabled = userIds.length === 0 || pending || done;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="text-sm text-slate-700 dark:text-slate-300">
        {userIds.length === 0
          ? "No highlighted employees to queue."
          : `${userIds.length} employee${userIds.length !== 1 ? "s" : ""} highlighted (within 1 week).`}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-not-allowed ${colors.bg} ${colors.hover} ${colors.ring}`}
      >
        <UserPlus className="w-4 h-4" aria-hidden="true" />
        {pending ? "Adding…" : done ? "Done" : "Add Highlighted to Queue"}
      </button>
      {message && (
        <p className="basis-full text-xs text-slate-600 dark:text-slate-300">{message}</p>
      )}
    </div>
  );
}
