"use client";

// Exact wording/styling from Emp_Folder's js/confirm-dialog.js + globals.css
// .search-popup/.confirm-popup — the same shell used app-wide in the
// reference for every OK/Cancel confirmation.
export default function ConfirmDialog({
  message,
  onCancel,
  onConfirm,
  confirmLabel = "OK",
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-[360px] max-h-full overflow-y-auto box-border bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 rounded-2xl px-6 pt-7 pb-6 shadow-[0_12px_32px_0_#00000026] text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-[#4b4949] dark:text-slate-300 mb-[22px]">{message}</p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-[#4b4949] dark:text-slate-300 bg-white dark:bg-slate-900 border-2 border-black/25 dark:border-white/20 hover:bg-[#f0f4fa] dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
