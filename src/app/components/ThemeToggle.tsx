"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Two-state light/dark switch for the main app shell.
 *
 * next-themes resolves the theme on the client, so `theme` is undefined on the
 * server and during the first render. Rendering the icons before mount would
 * therefore emit whichever icon the server guessed and then swap it, which is
 * both a hydration mismatch and a visible flicker. We render a same-size
 * placeholder until mounted so the top bar doesn't shift.
 *
 * The CRM subtree has its own toggle (ThemeToggleRow) against the same
 * provider, so the two stay in sync — both read and write next-themes state.
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  if (!mounted) {
    return <div className="w-9 h-9 shrink-0" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title="Toggle dark mode"
      className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <span className="sr-only">
        {isDark
          ? "Dark mode active. Switch to light mode."
          : "Light mode active. Switch to dark mode."}
      </span>
      {isDark ? (
        <Moon className="w-5 h-5" aria-hidden="true" />
      ) : (
        <Sun className="w-5 h-5" aria-hidden="true" />
      )}
    </button>
  );
}
