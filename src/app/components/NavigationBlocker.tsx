"use client";

// Shared "block in-app navigation while a page has unsaved changes" system
// (2026-08-11) — the officially Next.js-documented pattern (Link's own
// `onNavigate` prop + a shared Context), see node_modules/next/dist/docs/
// 01-app/03-api-reference/02-components/link.md's "Blocking navigation"
// section (added v15.3.0; this app is on 16.2.4). ONE Provider wraps the
// whole app (AppShell, alongside the existing BreadcrumbProvider); any
// single page that wants guarding calls useNavigationGuard() and passes
// its own isDirty/onSave/onDiscard — everything else (Sidebar's Links) just
// reads isBlocked, a no-op for the vast majority of pages that never
// register anything.
//
// Scope (explicit product decision, 2026-08-11): only in-app Link clicks
// (sidebar navigation) are covered here — tab-close/refresh/URL-bar nav
// still needs its own beforeunload listener (unchanged, already exists on
// Package Table); the browser back/forward button is NOT covered — no
// supported Next.js mechanism exists for it (no real page unload happens
// for client-side back-navigation, so beforeunload doesn't fire either),
// and the only workaround (manual pushState/popstate manipulation) was
// explicitly declined as too fragile for what it'd buy.
//
// Re-render footprint: `isBlocked` (what Sidebar subscribes to) only flips
// at dirty/clean *transitions*, not on every edit within an already-dirty
// page — the actual save/discard closures are threaded through refs, not
// context state, specifically so a page with many editable cells (like
// Package Table) doesn't cause the whole app tree (this Provider wraps
// everything) to re-render on every keystroke.
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface GuardHandlers {
  onSave: () => Promise<boolean>;
  onDiscard: () => void;
}

interface NavigationBlockerContextType {
  isBlocked: boolean;
  /** Sidebar calls this from a Link's onNavigate. Returns true if the
   *  navigation was intercepted (caller must e.preventDefault()); false
   *  means nothing is registered right now, let the click through as
   *  normal. */
  guardNavigate: (href: string) => boolean;
  setBlocked: (blocked: boolean, handlers: GuardHandlers | null) => void;
}

const NavigationBlockerContext = React.createContext<NavigationBlockerContextType | null>(null);

/** Call from the ONE page that wants to guard navigation while dirty (e.g.
 *  Package Table). `onSave`/`onDiscard` are read via refs updated on every
 *  render, so the dialog always calls the latest closures (reflecting
 *  current pending-edit state) even though the registration effect itself
 *  only re-runs at isDirty transitions. Unregisters automatically on
 *  unmount, so navigating away by any other means (that this guard doesn't
 *  even cover, e.g. the back button) can't leave a stale block behind. */
export function useNavigationGuard(
  isDirty: boolean,
  onSave: () => Promise<boolean>,
  onDiscard: () => void,
) {
  const ctx = React.useContext(NavigationBlockerContext);
  const onSaveRef = React.useRef(onSave);
  const onDiscardRef = React.useRef(onDiscard);
  onSaveRef.current = onSave;
  onDiscardRef.current = onDiscard;

  React.useEffect(() => {
    if (!ctx) return;
    ctx.setBlocked(
      isDirty,
      isDirty ? { onSave: () => onSaveRef.current(), onDiscard: () => onDiscardRef.current() } : null,
    );
    return () => ctx.setBlocked(false, null);
    // ctx.setBlocked is stable (see the Provider below); only isDirty
    // transitions should re-run this, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, isDirty]);
}

/** Call from any in-app <Link> that should respect the guard (Sidebar). */
export function useGuardNavigate() {
  const ctx = React.useContext(NavigationBlockerContext);
  return ctx?.guardNavigate ?? (() => false);
}

export function NavigationBlockerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isBlocked, setIsBlocked] = React.useState(false);
  const handlersRef = React.useRef<GuardHandlers | null>(null);
  // Snapshot of {href, handlers} taken the INSTANT the dialog opens, not
  // re-read from handlersRef afterward (2026-08-11 fix — code review caught
  // a real race: the page's own pending-state-pruning effect can flip
  // isDirty to false — nulling handlersRef via useNavigationGuard's cleanup
  // — while the dialog is still open but before the user has clicked
  // anything, e.g. a still-in-flight revalidatePath from an earlier save
  // landing right as this dialog opens. Reading the live ref at click-time
  // would then silently no-op both buttons with no way out but the
  // backdrop. The snapshot is immune to that: once open, the dialog owns
  // its own copy and doesn't care what happens to the live registration.
  const [dialog, setDialog] = React.useState<{ href: string; handlers: GuardHandlers } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const setBlocked = React.useCallback((blocked: boolean, handlers: GuardHandlers | null) => {
    handlersRef.current = handlers;
    setIsBlocked(blocked);
  }, []);

  const guardNavigate = React.useCallback((href: string) => {
    if (!handlersRef.current) return false;
    setDialog({ href, handlers: handlersRef.current });
    return true;
  }, []);

  const value = React.useMemo<NavigationBlockerContextType>(
    () => ({ isBlocked, guardNavigate, setBlocked }),
    [isBlocked, guardNavigate, setBlocked],
  );

  const closeDialog = () => setDialog(null);

  const handleSaveAndGo = async () => {
    if (!dialog) return;
    setSaving(true);
    const ok = await dialog.handlers.onSave();
    setSaving(false);
    // Close either way, success or failure — don't stay open re-explaining
    // a failure the underlying page already explains better. On failure,
    // closing reveals the grid's own error UI (highlighted failed cells,
    // its existing "N saved, N failed" summary — the exact same thing the
    // plain Save button already shows for this failure), which this
    // dialog's full-viewport overlay was hiding while open.
    setDialog(null);
    if (ok) {
      router.push(dialog.href);
    }
  };

  const handleDiscardAndGo = () => {
    if (!dialog) return;
    dialog.handlers.onDiscard();
    const href = dialog.href;
    setDialog(null);
    router.push(href);
  };

  return (
    <NavigationBlockerContext.Provider value={value}>
      {children}
      {dialog &&
        createPortal(
          // Same overlay/card/button shell as ConfirmDialog.tsx (the
          // app-wide OK/Cancel confirmation used e.g. by employee delete)
          // for visual consistency — a distinct component, not a reuse of
          // that one, since this needs two different POSITIVE actions
          // (Save Changes / Discard), not a confirm-vs-cancel binary.
          // Backdrop click cancels (same convention ConfirmDialog uses),
          // so there's still a way to back out even with only two buttons.
          <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !saving) closeDialog();
            }}
          >
            <div
              className="w-full max-w-[360px] max-h-full overflow-y-auto box-border bg-white rounded-2xl px-6 pt-7 pb-6 shadow-[0_12px_32px_0_#00000026] text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-[#4b4949] mb-[22px]">
                You have unsaved changes on this page. Save them before leaving, or discard them?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveAndGo()}
                  autoFocus
                  className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDiscardAndGo}
                  className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-[#4b4949] bg-white border-2 border-black/25 hover:bg-[#f0f4fa] transition-colors disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </NavigationBlockerContext.Provider>
  );
}
