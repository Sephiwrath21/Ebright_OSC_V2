"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Home, ChevronRight, AlertCircle, CheckCircle2,
  MessageSquare, BarChart3, Handshake, Sparkles, Printer,
} from "lucide-react";
import {
  BRANCHES, FA_REPORT_MAX_PER_CRITERION, faReportTotal,
  MOCK_INVITATIONS, MOCK_REPORTS,
} from "../_mock";

const CRITERIA = [
  {
    key: "communication" as const,
    title: "Communication",
    icon: MessageSquare,
    description:
      "Did you understand what was said to you? Are you talking about the right thing? Can you be understood despite errors? Have you conveyed your idea clearly? Is your language creative?",
  },
  {
    key: "analysis" as const,
    title: "Analysis",
    icon: BarChart3,
    description:
      "Did you understand the main idea? Have you broken down key points effectively? Are you considering different perspectives? Can you explain your reasoning clearly? Did you support your ideas with strong evidence?",
  },
  {
    key: "interaction" as const,
    title: "Interaction",
    icon: Handshake,
    description:
      "Are you actively engaging with others? Are you responding appropriately to what is said? Do you encourage discussion and teamwork? Are you showing interest and listening well? Are you making the conversation enjoyable and meaningful?",
  },
  {
    key: "performance" as const,
    title: "Performance",
    icon: Sparkles,
    description:
      "Did you present with confidence? Was your voice clear and engaging? Did you use body language effectively? Were you well-prepared? Did you connect with your audience?",
  },
] as const;

type ScoreKey = typeof CRITERIA[number]["key"];
type Scores = Record<ScoreKey, number>;

function ScoreSlider({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <input
        type="range"
        min={0}
        max={FA_REPORT_MAX_PER_CRITERION}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-slate-900"
      />
      <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1 px-0.5">
        {[0, 5, 10, 15, 20, 25].map(t => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}

export default function FAReportFormClient() {
  const { id: invitationId } = useParams<{ id: string }>();

  const invitation = MOCK_INVITATIONS.find(i => i.id === invitationId);
  const existing   = MOCK_REPORTS.find(r => r.invitationId === invitationId);

  const MID = Math.round(FA_REPORT_MAX_PER_CRITERION / 2);
  const [scores, setScores] = useState<Scores>({
    communication: existing?.communicationScore ?? MID,
    analysis:      existing?.analysisScore      ?? MID,
    interaction:   existing?.interactionScore   ?? MID,
    performance:   existing?.performanceScore   ?? MID,
  });
  const [remarks,    setRemarks]    = useState(existing?.remarks ?? "");
  const [preparedBy, setPreparedBy] = useState(existing?.preparedBy ?? "");
  const [videoLink,  setVideoLink]  = useState(existing?.videoLink ?? "");
  const [assessDate, setAssessDate] = useState(
    existing?.assessmentDate ?? new Date().toISOString().slice(0, 10),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total    = scores.communication + scores.analysis + scores.interaction + scores.performance;
  const totalMax = FA_REPORT_MAX_PER_CRITERION * 4;

  function handleSave() {
    if (!preparedBy.trim()) {
      setError('Fill in your name in "Prepared by" before saving.');
      return;
    }
    setError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (!invitation) {
    return (
      <div className="min-h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-700 mb-1">Invitation not found</h1>
          <p className="text-sm text-slate-500 mb-4">
            This report links to an invitation that doesn&apos;t exist.
          </p>
          <Link
            href="/dashboards/fa/reports"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to reports
          </Link>
        </div>
      </div>
    );
  }

  const branchObj = BRANCHES.find(b => b.code === invitation.branch);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-28">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <Link href="/dashboards/fa" className="hover:text-slate-900 transition-colors">FA System</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <Link href="/dashboards/fa/reports" className="hover:text-slate-900 transition-colors">Reports</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <span className="text-slate-800 font-medium truncate max-w-[200px]">{invitation.studentName}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-mono text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 tracking-widest">
                {invitation.branch}
              </span>
              <span className="font-mono text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 tracking-widest">
                G{invitation.grade}
              </span>
              <span className="font-mono text-xs text-slate-400">#{invitation.studentId}</span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                {existing ? "Editing report" : "New report"}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
              {invitation.studentName}
            </h1>
            {branchObj && (
              <p className="text-sm text-slate-500 mt-1">{branchObj.name}</p>
            )}
          </div>
          {existing && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-colors shrink-0 mt-1"
              title="Certificate preview — backend not connected yet"
            >
              <Printer className="w-3.5 h-3.5" /> Preview certificate
            </button>
          )}
        </div>

        <hr className="border-slate-200 mb-6" />

        {/* Date + Prepared by */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              Date of Assessment
            </label>
            <input
              type="date"
              value={assessDate}
              onChange={e => setAssessDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              Prepared by
            </label>
            <input
              type="text"
              value={preparedBy}
              onChange={e => setPreparedBy(e.target.value)}
              placeholder="Coach name…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Score cards */}
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Assessment Criteria
        </p>
        <div className="space-y-4 mb-5">
          {CRITERIA.map(c => {
            const score = scores[c.key];
            const Icon  = c.icon;
            return (
              <div key={c.key} className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-slate-600" />
                    </div>
                    <span className="font-semibold text-slate-900">{c.title}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-900">{score}</span>
                    <span className="text-sm text-slate-400">/ {FA_REPORT_MAX_PER_CRITERION}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">{c.description}</p>
                <ScoreSlider
                  value={score}
                  onChange={n => setScores(prev => ({ ...prev, [c.key]: n }))}
                />
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {[0, 10, 15, 20, 25].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setScores(prev => ({ ...prev, [c.key]: preset }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        score === preset
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Remarks */}
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Remarks</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
          <textarea
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            rows={6}
            maxLength={400}
            placeholder="Strengths shown, areas to work on, anything notable from the showcase…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y placeholder:text-slate-400"
            style={{ minHeight: 140 }}
          />
          <div
            className={`text-right font-mono text-[11px] mt-1.5 ${
              remarks.length > 380 ? "text-red-500 font-bold" : "text-slate-400"
            }`}
          >
            {remarks.length} / 400
          </div>
        </div>

        {/* Video link */}
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Video Link{" "}
          <span className="normal-case font-normal">(optional)</span>
        </p>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
          <input
            type="url"
            value={videoLink}
            onChange={e => setVideoLink(e.target.value)}
            placeholder="https://drive.google.com/… or https://youtu.be/…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
          />
        </div>

        {/* Score breakdown (existing reports only) */}
        {existing && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Score Breakdown
            </p>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {CRITERIA.map(c => (
                  <div key={c.key} className="text-center">
                    <p className="text-2xl font-bold text-slate-900">{scores[c.key]}</p>
                    <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mt-0.5">
                      {c.title}
                    </p>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-baseline gap-2 justify-center">
                <span className="text-xs text-slate-500">Total</span>
                <span className="text-2xl font-bold text-slate-900">{faReportTotal(existing)}</span>
                <span className="text-sm text-slate-400">/ {totalMax}</span>
              </div>
            </div>
          </>
        )}

        {/* Inline messages */}
        <div className="space-y-3">
          {saved && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-xs text-green-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
              Report saved (mock only — backend not connected yet).
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total</span>
            <span className="text-2xl font-bold text-slate-900">{total}</span>
            <span className="text-sm text-slate-400">/ {totalMax}</span>
          </div>

          <div className="flex-1 min-w-[160px]">
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-900 rounded-full transition-all"
                style={{ width: `${(total / totalMax) * 100}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-slate-900 hover:bg-slate-700 transition-colors"
          >
            {saved ? (
              <><CheckCircle2 className="w-4 h-4" /> Saved!</>
            ) : existing ? (
              <><CheckCircle2 className="w-4 h-4" /> Update report</>
            ) : (
              "Save report"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
