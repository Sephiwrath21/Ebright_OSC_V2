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
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-[min(360px,calc(100vw-48px))] box-border bg-white rounded-2xl px-6 pt-7 pb-6 shadow-[0_12px_32px_0_#00000026] text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-[#4b4949] mb-[22px]">{message}</p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[10px] px-6 py-2.5 text-sm font-medium text-[#4b4949] bg-white border-2 border-black/25 hover:bg-[#f0f4fa] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
