"use client";

import { useState, useTransition } from "react";
import { Inbox } from "lucide-react";
import { approveLeaveRequest, rejectLeaveRequest } from "@/app/attendance/leave/actions";

export interface HodApprovalItem {
  leaveId: number;
  displayId: string;
  requesterName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  appliedAt: string;
}

/** Pending-request table with Approve / Reject (reason required) actions for a HOD. */
export default function HodApprovalTable({ items }: { items: HodApprovalItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onApprove = (id: number) => {
    setError(null);
    startTransition(async () => {
      const res = await approveLeaveRequest(id);
      if (!res.ok) setError(res.error ?? "Failed to approve.");
    });
  };

  const onReject = (id: number) => {
    setError(null);
    startTransition(async () => {
      const res = await rejectLeaveRequest(id, reason);
      if (!res.ok) {
        setError(res.error ?? "Failed to reject.");
        return;
      }
      setRejectingId(null);
      setReason("");
    });
  };

  if (items.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl px-6 py-12 text-center">
        <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
          <Inbox className="w-5 h-5 text-slate-400" aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-900">Nothing awaiting your approval.</p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {error && (
        <div className="px-6 py-3 bg-red-50 text-sm text-red-700 border-b border-red-100">{error}</div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
          <tr>
            <th className="text-left px-6 py-3">ID</th>
            <th className="text-left px-6 py-3">Employee</th>
            <th className="text-left px-6 py-3">Type</th>
            <th className="text-left px-6 py-3">Dates</th>
            <th className="text-left px-6 py-3">Days</th>
            <th className="text-left px-6 py-3">Reason</th>
            <th className="text-right px-6 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.leaveId} className="border-t border-slate-100 align-top">
              <td className="px-6 py-3 font-medium text-slate-900">{item.displayId}</td>
              <td className="px-6 py-3 text-slate-700">{item.requesterName}</td>
              <td className="px-6 py-3 text-slate-700">{item.leaveTypeName}</td>
              <td className="px-6 py-3 text-slate-500">{item.startDate} → {item.endDate}</td>
              <td className="px-6 py-3 text-slate-700">{item.totalDays}</td>
              <td className="px-6 py-3 text-slate-500 max-w-[16rem] truncate">{item.reason ?? "—"}</td>
              <td className="px-6 py-3">
                {rejectingId === item.leaveId ? (
                  <div className="flex flex-col gap-2 items-end">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejection (required)…"
                      className="w-64 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isPending || !reason.trim()}
                        onClick={() => onReject(item.leaveId)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50 hover:bg-red-700"
                      >
                        Confirm Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null);
                          setReason("");
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => onApprove(item.leaveId)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setRejectingId(item.leaveId)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
