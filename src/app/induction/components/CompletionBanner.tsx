"use client";

/**
 * Green completion banner shown at the top of HR Page 2 when status =
 * Completed. Houses the Assign Role → button.
 */
interface Props {
  candidateName: string;
  onAssignRole: () => void;
}

export function CompletionBanner({ candidateName, onAssignRole }: Props) {
  return (
    <div
      className="rounded-2xl border border-emerald-200 dark:border-emerald-700 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900 dark:to-emerald-900/50 p-5 mb-5 flex flex-wrap items-center justify-between gap-4"
      role="status"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="text-2xl shrink-0" aria-hidden="true">🎉</span>
        <div className="min-w-0">
          <p className="text-base font-bold text-emerald-900 dark:text-emerald-200">Induction Complete!</p>
          <p className="mt-0.5 text-sm text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
            <span className="font-semibold">{candidateName}</span> has finished all induction tasks.
            Assign a permanent role to move them out of onboarding.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAssignRole}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 shrink-0"
      >
        Assign Role →
      </button>
    </div>
  );
}
