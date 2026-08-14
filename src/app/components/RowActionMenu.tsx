"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import ConfirmDialog from "@/app/components/ConfirmDialog";

// Exact chrome from Emp_Folder's globals.css .row-action-btn/.row-action-menu
// (js/namelist-row-actions.js, js/selectpp-list-view.js) — the mock's menu
// has exactly one item, Delete, everywhere it appears.
//
// List view's row container has overflow:hidden (rounded-card clipping, see
// .table-card in globals.css) which would clip an absolutely-positioned
// dropdown. The mock's js/row-action-menu-position.js works around this by
// switching the menu to viewport-relative position:fixed at open time,
// computed from the button's getBoundingClientRect() — reproduced verbatim
// below (flip above the button when there's no room below, clamp
// horizontally to the viewport, close on scroll since a fixed-position menu
// would otherwise drift away from its button).
const MARGIN = 6;

interface Props {
  name: string;
  /** Called only after the user confirms. Omit while deletion isn't wired to
   *  a real mutation yet — an explanatory notice shows instead of pretending
   *  to delete a real employee record. Returning { ok: false, error } shows
   *  that error instead of silently closing; the caller is responsible for
   *  refreshing/removing the row from its own list on success. */
  onDelete?: () => Promise<{ ok: boolean; error?: string } | void>;
  className?: string;
}

export default function RowActionMenu({ name, onDelete, className }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleScroll() {
      setOpen(false);
    }
    document.addEventListener("click", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  // Computed after the menu mounts (needs its own rendered height/width).
  useEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const btnRect = btnRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const openUp = btnRect.bottom + menuRect.height + MARGIN > window.innerHeight;

    let top = openUp ? btnRect.top - menuRect.height - MARGIN : btnRect.bottom + MARGIN;
    let left = btnRect.right - menuRect.width;

    const maxLeft = window.innerWidth - menuRect.width - MARGIN;
    if (left > maxLeft) left = maxLeft;
    if (left < MARGIN) left = MARGIN;
    if (top < MARGIN) top = MARGIN;

    setMenuPos({ top, left });
  }, [open]);

  // className fully replaces the default rather than appending to it —
  // `relative ${className}` would put both "relative" and "absolute" on the
  // same element when a caller (e.g. PersonCard's corner-pinned menu) passes
  // "absolute top-1.5 right-1.5"; Tailwind's generated stylesheet orders
  // .relative after .absolute, so .relative silently won regardless of
  // which one appeared later in the class string, leaving the menu
  // in-flow (centered by the card's flex layout) instead of corner-pinned.
  // Nothing inside needs the wrapper itself to be a position context anymore
  // — the dropdown uses position:fixed (computed above), not absolute.
  return (
    <div ref={ref} className={className ?? "relative"}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={`Actions for ${name}`}
        aria-haspopup="true"
        aria-expanded={open}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
          open
            ? "bg-[#f0f4fa] text-[#4b4949] dark:bg-slate-800 dark:text-slate-300"
            : "text-[#4b4949a3] hover:bg-[#f0f4fa] hover:text-[#4b4949] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        }`}
      >
        <MoreVertical className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={menuPos ? { position: "fixed", top: menuPos.top, left: menuPos.left } : { position: "fixed", top: -9999, left: -9999 }}
          className="min-w-[130px] bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 border border-black/10 rounded-[10px] shadow-[0_4px_14px_0_#0000001a] z-20 overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setConfirming(true);
            }}
            className="block w-full text-left px-3.5 py-2.5 text-sm text-[#d0342c] hover:bg-[#fdecec] transition-colors dark:text-red-400 dark:hover:bg-red-900 dark:hover:text-red-300"
          >
            Delete
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          message={
            deleting
              ? `Deleting ${name || "this employee"}…`
              : `Are you sure you want to delete ${name || "this employee"}?`
          }
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            if (deleting) return;
            if (!onDelete) {
              setConfirming(false);
              setNotice(true);
              return;
            }
            setDeleting(true);
            const result = await onDelete();
            setDeleting(false);
            setConfirming(false);
            if (result && result.ok === false) setError(result.error ?? "Failed to delete.");
          }}
        />
      )}

      {notice && (
        <ConfirmDialog
          message="Deleting isn't wired to a real record yet — this needs a decision on what 'delete' should do to a real employee (remove entirely, or archive?) before it's connected."
          confirmLabel="OK"
          onCancel={() => setNotice(false)}
          onConfirm={() => setNotice(false)}
        />
      )}

      {error && (
        <ConfirmDialog
          message={error}
          confirmLabel="OK"
          onCancel={() => setError(null)}
          onConfirm={() => setError(null)}
        />
      )}
    </div>
  );
}
