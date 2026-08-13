"use client";

import Link from "next/link";
import { initialsFromName } from "@/lib/text";
import {
  ArrowLeft,
  ChevronRight,
  Home,
  Lock,
  CheckCircle2,
  Clock,
} from "lucide-react";
import type { OffboardingCaseDetail } from "@/lib/offboarding/queries";
import {
  type OffboardingStage,
  stageIndex,
} from "@/lib/offboarding/stages";

interface Props {
  detail: OffboardingCaseDetail;
}

const STAGE_ORDER: OffboardingStage[] = [
  "Trigger",
  "HRReview",
  "ExitInterview",
  "Checklist",
  "SignOff",
  "Done",
];

const STAGE_LABEL: Record<OffboardingStage, string> = {
  Trigger: "Trigger",
  HRReview: "HR Review",
  ExitInterview: "Exit Interview",
  Checklist: "Checklist",
  SignOff: "Sign-off & Done",
  Done: "Done",
};

const ACTOR_PILL: Record<string, string> = {
  HR: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  IT: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200",
  Supervisor: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  Candidate: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
};

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OffboardingCaseDetailView({ detail }: Props) {
  const currentIdx = stageIndex(detail.currentStage);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
        {/* ── BREADCRUMB ── */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/offboarding" className="hover:text-slate-900 dark:hover:text-slate-100">Offboarding</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium truncate">{detail.user.name}</span>
        </nav>

        {/* ── BACK ── */}
        <div className="mb-4">
          <Link
            href="/dashboards/offboarding"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Offboarding
          </Link>
        </div>

        {/* ── CANDIDATE INFO CARD ── */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 bg-slate-100 text-slate-700 ring-2 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600"
                aria-hidden="true"
              >
                {initialsFromName(detail.user.name)}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">{detail.user.name}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{detail.user.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  {detail.user.position && <span>{detail.user.position}</span>}
                  {detail.user.position && <span aria-hidden="true">·</span>}
                  <span>{detail.user.departmentName ?? "No department"}</span>
                  {detail.user.branchCode && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{detail.user.branchCode}</span>
                    </>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold ${
                    detail.caseType === "Resign"
                      ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900 dark:text-violet-200 dark:border-violet-700"
                      : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700"
                  }`}>
                    {detail.caseType === "Resign" ? "Resign" : "Contract Ended"}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold ${
                    detail.status === "Completed"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700"
                      : detail.status === "InProgress"
                        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700"
                        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700"
                  }`}>
                    {detail.status === "InProgress" ? "In Progress" : detail.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last Day</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatLongDate(detail.lastWorkingDay)}</p>
              {detail.exitInterviewDate && (
                <>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Interview</p>
                  <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{formatLongDate(detail.exitInterviewDate)}</p>
                  {detail.exitInterviewTime && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{detail.exitInterviewTime}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── ASSIGNMENT (amendment) — read-only, set at case creation ── */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Assignment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">HR Officer</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{detail.assignedHr?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Supervisor</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{detail.supervisor?.name ?? "—"}</p>
            </div>
          </div>
        </section>

        {/* ── PROGRESS STEPPER ── */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5">
          <ol className="flex items-start justify-between gap-2" aria-label="Offboarding progress">
            {STAGE_ORDER.filter((s) => s !== "Done").map((stage, i, arr) => {
              const idx = stageIndex(stage);
              const isComplete = currentIdx > idx || detail.status === "Completed";
              const isActive = currentIdx === idx && detail.status !== "Completed";
              return (
                <li key={stage} className="flex-1 flex items-start gap-2 min-w-0">
                  <div className="flex flex-col items-center text-center flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                        isComplete
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : isActive
                            ? "bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-900 dark:border-blue-500 dark:text-blue-200"
                            : "bg-white border-slate-300 text-slate-400 dark:bg-slate-900 dark:border-slate-600"
                      }`}
                    >
                      {isComplete ? "✓" : idx + 1}
                    </div>
                    <p className={`mt-2 text-xs font-semibold ${
                      isComplete ? "text-emerald-700 dark:text-emerald-300" : isActive ? "text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"
                    }`}>
                      {STAGE_LABEL[stage]}
                    </p>
                  </div>
                  {i < arr.length - 1 && (
                    <div className={`h-0.5 flex-1 mt-5 ${isComplete ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── STAGE SECTIONS (read-only) ── */}
        <TriggerSection detail={detail} currentIdx={currentIdx} />
        <HRReviewSection detail={detail} currentIdx={currentIdx} />
        <ExitInterviewSection detail={detail} currentIdx={currentIdx} />
        <ChecklistSection detail={detail} currentIdx={currentIdx} />
        <SignoffSection detail={detail} currentIdx={currentIdx} />

        {/* ── AUDIT LOG ── */}
        <section aria-labelledby="audit-heading" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-5">
          <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 id="audit-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Audit Trail</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {detail.auditLog.length} event{detail.auditLog.length === 1 ? "" : "s"}
            </p>
          </header>
          {detail.auditLog.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400 italic">No events recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {detail.auditLog.map((event) => (
                <li key={event.id} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 dark:bg-blue-900 dark:text-blue-200" aria-hidden="true">
                      {event.actorName ? initialsFromName(event.actorName) : "·"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        <span className="font-semibold">{event.actorName ?? "System"}</span>
                        <span className="text-slate-500 dark:text-slate-400"> · {humanizeAction(event.action)}</span>
                        {event.stage && (
                          <span className="ml-1.5 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {event.stage}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{formatDateTime(event.createdAt)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Bookkeeping footer */}
        <p className="text-[11px] text-slate-400 italic">
          Created by {detail.createdByName} on {formatDateTime(detail.createdAt)}.
          {" Read-only preview — actions wire up in Phases 2-5."}
        </p>
      </div>
    </div>
  );
}

// ─── Stage sections ───

function StageHeader({
  number,
  title,
  state,
}: {
  number: number;
  title: string;
  state: "locked" | "active" | "done";
}) {
  return (
    <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          state === "done"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
            : state === "active"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800"
        }`}
        aria-hidden="true"
      >
        {state === "done" ? <CheckCircle2 className="w-4 h-4" /> : state === "active" ? <Clock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Stage {number}: {title}</h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          {state === "done" ? "Completed" : state === "active" ? "In progress" : "Locked"}
        </p>
      </div>
    </header>
  );
}

function StageWrapper({
  number,
  title,
  state,
  children,
}: {
  number: number;
  title: string;
  state: "locked" | "active" | "done";
  children: React.ReactNode;
}) {
  return (
    <section className={`bg-white dark:bg-slate-900 border rounded-2xl overflow-hidden mb-5 ${
      state === "locked" ? "border-slate-200 dark:border-slate-800 opacity-60" : "border-slate-200 dark:border-slate-800"
    }`}>
      <StageHeader number={number} title={title} state={state} />
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function stageState(stage: OffboardingStage, currentIdx: number, status: string): "locked" | "active" | "done" {
  const idx = stageIndex(stage);
  if (status === "Completed") return "done";
  if (currentIdx > idx) return "done";
  if (currentIdx === idx) return "active";
  return "locked";
}

function TriggerSection({ detail, currentIdx }: { detail: OffboardingCaseDetail; currentIdx: number }) {
  const state = stageState("Trigger", currentIdx, detail.status);
  return (
    <StageWrapper number={1} title="Trigger" state={state}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Row label="Type">
          {detail.caseType === "Resign" ? "Resign — staff initiated" : "Contract Ended — system flagged"}
        </Row>
        {detail.caseType === "Resign" && (
          <>
            <Row label="Resignation submitted">{formatDateTime(detail.resignedAt)}</Row>
            <Row label="Resignation letter">
              {detail.resignationLetterFileId
                ? <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{detail.resignationLetterFileId}</span>
                : "—"}
            </Row>
          </>
        )}
        {detail.caseType === "ContractEnded" && (
          <Row label="Supervisor decision">
            {detail.supervisorDecision
              ? `${detail.supervisorDecision === "End" ? "End — proceed with offboarding" : "Continue — renew contract"} (${formatDateTime(detail.supervisorDecisionAt)})`
              : "Awaiting supervisor"}
          </Row>
        )}
      </dl>
    </StageWrapper>
  );
}

function HRReviewSection({ detail, currentIdx }: { detail: OffboardingCaseDetail; currentIdx: number }) {
  const state = stageState("HRReview", currentIdx, detail.status);
  return (
    <StageWrapper number={2} title="HR Review" state={state}>
      {state === "locked" ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Locked until the previous stage is complete.</p>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Row label="Last working day">{formatLongDate(detail.lastWorkingDay)}</Row>
          <Row label="Exit interview date">{formatLongDate(detail.exitInterviewDate)}</Row>
          <Row label="Interview time">{detail.exitInterviewTime ?? "—"}</Row>
          <Row label="Interview location">{detail.exitInterviewLocation ?? "—"}</Row>
        </dl>
      )}
    </StageWrapper>
  );
}

function ExitInterviewSection({ detail, currentIdx }: { detail: OffboardingCaseDetail; currentIdx: number }) {
  const state = stageState("ExitInterview", currentIdx, detail.status);
  return (
    <StageWrapper number={3} title="Exit Interview" state={state}>
      {state === "locked" ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Locked until the previous stage is complete.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-3 text-sm">
          <Row label="Outcome">{detail.exitInterviewOutcome ?? "Not recorded yet"}</Row>
          <Row label="Completed at">{formatDateTime(detail.exitInterviewCompletedAt)}</Row>
          <Row label="Notes">
            <span className="block whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {detail.exitInterviewNotes ?? "—"}
            </span>
          </Row>
        </dl>
      )}
    </StageWrapper>
  );
}

function ChecklistSection({ detail, currentIdx }: { detail: OffboardingCaseDetail; currentIdx: number }) {
  const state = stageState("Checklist", currentIdx, detail.status);
  return (
    <StageWrapper number={4} title="Checklist" state={state}>
      {state === "locked" ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Locked until the previous stage is complete.</p>
      ) : detail.checklist.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Checklist not seeded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {detail.checklist.map((item) => {
            const isDone = item.status === "Done";
            return (
              <li key={item.id} className="py-3 flex items-start gap-3">
                <div
                  className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center ${
                    isDone
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-600"
                  }`}
                  aria-hidden="true"
                >
                  {isDone && <span className="text-[11px] font-bold leading-none">✓</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${isDone ? "text-slate-500 line-through dark:text-slate-400" : "text-slate-700 dark:text-slate-300"}`}>
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${ACTOR_PILL[item.actorRole] ?? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>
                      {item.actorRole}
                    </span>
                    {item.itemKey === "petty_cash" && item.linkedClaimId && (
                      <Link
                        href={`/claim/${item.linkedClaimId}`}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        View claim #{item.linkedClaimId} →
                      </Link>
                    )}
                    {item.completedAt && (
                      <span className="text-[11px] text-slate-400">{formatDateTime(item.completedAt)}</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </StageWrapper>
  );
}

function SignoffSection({ detail, currentIdx }: { detail: OffboardingCaseDetail; currentIdx: number }) {
  const state = stageState("SignOff", currentIdx, detail.status);
  return (
    <StageWrapper number={5} title="Sign-off & Done" state={state}>
      {state === "locked" ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Locked until the previous stage is complete.</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Row label="Supervisor">{detail.supervisor?.name ?? "Not assigned"}</Row>
            <Row label="Supervisor sign-off">
              {detail.supervisorSignoffStatus
                ? `${detail.supervisorSignoffStatus} (${formatDateTime(detail.supervisorSignoffAt)})`
                : "Pending"}
            </Row>
            {detail.supervisorRemarks && (
              <Row label="Supervisor remarks">
                <span className="block whitespace-pre-wrap text-slate-700 dark:text-slate-300">{detail.supervisorRemarks}</span>
              </Row>
            )}
          </dl>

          <hr className="border-slate-200 dark:border-slate-800" />

          <dl className="grid grid-cols-1 gap-3 text-sm">
            <Row label="HR finance remarks">
              <span className="block whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {detail.financeRemarks ?? "Not recorded yet"}
              </span>
            </Row>
            {detail.finalPayBreakdown && typeof detail.finalPayBreakdown === "object" ? (
              <Row label="Final pay breakdown">
                <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                  {JSON.stringify(detail.finalPayBreakdown, null, 2)}
                </pre>
              </Row>
            ) : null}
            <Row label="Finance processed">
              {detail.financeProcessedAt
                ? `${detail.financeProcessedByName ?? "Finance"} · ${formatDateTime(detail.financeProcessedAt)}`
                : "Pending"}
            </Row>
            <Row label="Account deactivated">
              {detail.completedAt ? formatDateTime(detail.completedAt) : "Pending"}
            </Row>
          </dl>
        </div>
      )}
    </StageWrapper>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300">{children}</dd>
    </div>
  );
}

function humanizeAction(action: string): string {
  switch (action) {
    case "CaseCreated": return "created the case";
    case "StageAdvanced": return "advanced the stage";
    case "ChecklistItemCompleted": return "completed a checklist item";
    case "EmailSent": return "sent an email";
    case "SupervisorDecision": return "made a supervisor decision";
    case "SupervisorSignOff": return "signed off";
    case "FinanceProcessed": return "processed final pay";
    case "AccountDeactivated": return "deactivated the account";
    default: return action;
  }
}
