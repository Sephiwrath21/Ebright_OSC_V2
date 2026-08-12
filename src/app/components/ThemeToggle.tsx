"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/lib/theme";

/**
 * Two-state light/dark switch.
 *
 * Toggling flips the class on <html> for an instant repaint and writes the
 * cookie so the server renders the same theme on the next request. There is no
 * server action and no re-render — the class on <html> is the single source of
 * truth, and the icons and the screen-reader label are both chosen from it by
 * CSS rather than by React state.
 */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${
      location.protocol === "https:" ? "; Secure" : ""
    }`;
  }

  return (
    <button
      onClick={toggle}
      title="Toggle dark mode"
      className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <span className="sr-only dark:hidden">Light mode active. Switch to dark mode.</span>
      <span className="sr-only hidden dark:inline">Dark mode active. Switch to light mode.</span>
      <Sun className="w-5 h-5 dark:hidden" aria-hidden="true" />
      <Moon className="w-5 h-5 hidden dark:block" aria-hidden="true" />
    </button>
  );
}
