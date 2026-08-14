"use client";

/**
 * Modular Induction Training embed panel — per spec Phase A.
 *
 * Self-contained card that displays a placeholder for the Induction Training
 * flowchart. Will be wired to Induction_Training___All_Employee_Types.html
 * when that file is available; for now shows a placeholder + "Open Full Flow"
 * link that points where the file is expected to live (currently a 404).
 *
 * // TODO: connect to Induction_Training___All_Employee_Types.html — replace
 * //       the externalUrl prop's default with the real path once the file
 * //       is hosted somewhere accessible.
 */
interface Props {
  employeeTypeLabel: string;
  /** Override the default file path if the flowchart lives elsewhere. */
  externalUrl?: string;
}

export function InductionTrainingEmbed({
  employeeTypeLabel,
  externalUrl = "/Induction_Training___All_Employee_Types.html",
}: Props) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded bg-slate-900 dark:bg-slate-700 text-white text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5">
            Induction Training
          </span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            eBright Onboarding Flow — {employeeTypeLabel}
          </h2>
        </div>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 dark:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-600"
        >
          ↗ Open Full Flow
        </a>
      </header>
      <div className="px-6 py-10 bg-slate-50 dark:bg-slate-800 text-center">
        <p className="text-3xl mb-2" aria-hidden="true">📊</p>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Induction Training Flowchart</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          Link this panel to <code className="font-mono text-[11px] bg-white dark:bg-slate-950 px-1 rounded">Induction_Training___All_Employee_Types.html</code>{" "}
          to embed the full flowchart here.
        </p>
      </div>
    </section>
  );
}
