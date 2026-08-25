"use client";

// Shared List/Donut toggle (2026-08-22) — previously each EntityCardOverview
// section (Daily, Monthly, ...) owned its own independent "cardMode" state,
// so switching Daily to Donut left Monthly on List and vice versa. This
// context lifts that single choice to a page-level provider (wrapped around
// the WHOLE Department/Branch/All Departments overview on /task-manager) so
// one toggle button governs every section underneath it at once.
//
// EntityCardOverview and AllDepartmentsSection both read this context: when
// present, they use its shared mode/setMode and suppress their OWN toggle
// button (CardModeToggle, rendered once near the Department/Branch dropdown,
// is the only control). When absent (any OTHER page that renders these
// components without wrapping them in a CardModeProvider — Home, Department
// Overview on task-manager-view.tsx), each section keeps its own local
// state and its own toggle button, exactly as before this change — an
// unwrapped consumer is a deliberate, backward-compatible fallback, not an
// error state.
import * as React from "react";

export type CardMode = "list" | "donut";

interface CardModeState {
  mode: CardMode;
  setMode: (mode: CardMode) => void;
}

const CardModeContext = React.createContext<CardModeState | null>(null);

/** Persistence (2026-08-22, user request) — ONE stored preference per user,
 *  same localStorage-per-browser/device convention EntityCardOverview's own
 *  "Only Me"/"View All" toggle already established (onlyMeStorageKey) —
 *  keyed by userId (per-user, not shared/global), restored on the next
 *  page load/navigation. Not synced across devices/browsers; that's the
 *  established, already-accepted trade-off for this exact kind of
 *  preference in this codebase. */
function cardModeStorageKey(userId: string): string {
  return `tm-cardmode-${userId}`;
}

function readStoredCardMode(userId: string): CardMode | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(cardModeStorageKey(userId));
  return stored === "list" || stored === "donut" ? stored : null;
}

export function CardModeProvider({
  userId,
  children,
}: {
  /** The viewer's own user id — the stored preference's key. */
  userId: string;
  children: React.ReactNode;
}) {
  // Hydration-safe (same fix EntityCardOverview's own onlyMe state already
  // applies): the FIRST render must match server output exactly — default
  // to "list" on both server and client, then apply the stored choice a
  // moment later in the effect below, which only ever runs client-side
  // AFTER hydration has already reconciled.
  const [mode, setModeState] = React.useState<CardMode>("list");
  React.useEffect(() => {
    const stored = readStoredCardMode(userId);
    if (stored !== null) setModeState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const setMode = (next: CardMode) => {
    setModeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(cardModeStorageKey(userId), next);
    }
  };
  const value = React.useMemo(() => ({ mode, setMode }), [mode]);
  return <CardModeContext.Provider value={value}>{children}</CardModeContext.Provider>;
}

/** Null when no CardModeProvider is above in the tree — callers fall back
 *  to their own local state in that case, see this file's own doc comment. */
export function useCardMode(): CardModeState | null {
  return React.useContext(CardModeContext);
}

/** The single page-level List/Donut button, rendered once near the
 *  Department/Branch dropdown — same visual style as the per-section toggle
 *  it replaces. Renders nothing outside a CardModeProvider (nothing to
 *  control). */
export function CardModeToggle() {
  const ctx = useCardMode();
  if (!ctx) return null;
  const { mode, setMode } = ctx;
  return (
    <div
      role="radiogroup"
      aria-label="Card style"
      className="flex items-center gap-0.5 rounded-full border border-gray-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === "list"}
        onClick={() => setMode("list")}
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          mode === "list"
            ? "bg-blue-600 text-white"
            : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
        }`}
      >
        List
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "donut"}
        onClick={() => setMode("donut")}
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          mode === "donut"
            ? "bg-blue-600 text-white"
            : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
        }`}
      >
        Pie
      </button>
    </div>
  );
}
