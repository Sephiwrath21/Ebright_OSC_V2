"use client";

// "No Claim/Incentive" list (2026-08-18, month filter added same day) — a
// company-wide compliance check for Finance (finance@ebright.my) and CEO
// only: before approving a claim/incentive payment, see who currently has
// at least one open (Pending/Active/Overdue/Escalated) Task Manager task
// due in a given month, grouped by Department/Branch. Read-only, on-demand
// — the ⋮ menu in the Task Manager page's top-left corner opens a modal
// that fetches a fresh snapshot each time it's opened OR the month changes
// (via fetchList, a server action closing over the viewer's email — see
// getNoClaimIncentiveList, task-manager/data/queries.ts), rather than
// computing this company-wide query on every page load for a menu that may
// never be opened.
//
// The actual modal UI now lives in NoClaimIncentiveModal (2026-08-26, see
// conversation) — extracted so the /home dashboard's "Not Clicked Task" card
// can drive the same modal with a different, scope-filtered fetchList
// (getScopedNoClaimIncentiveList) instead of this CEO/Finance-only one. This
// component is now just the ⋮ trigger + its own open state, unchanged
// otherwise.

import * as React from "react";
import { NoClaimIncentiveModal } from "./no-claim-incentive-modal";
import type { NoClaimIncentivePayload } from "./types";

export function NoClaimIncentiveMenu({
  fetchList,
}: {
  fetchList: (month: string) => Promise<NoClaimIncentivePayload>;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        title="No Claim/Incentive list"
        aria-label="Open No Claim/Incentive list"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
      >
        ⋮
      </button>
      <NoClaimIncentiveModal open={open} onClose={() => setOpen(false)} fetchList={fetchList} />
    </>
  );
}
