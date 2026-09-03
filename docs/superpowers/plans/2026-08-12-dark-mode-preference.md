# Dark Mode Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-state light/dark preference that persists in a cookie and is applied server-side, with the app shell and `/profile` converted to a dark palette.

**Architecture:** A `theme` cookie is read by the async root layout, which puts a `dark` class on `<html>` so the first server-rendered paint is already correct (no flash, no blocking script). A stateless client button toggles that class and rewrites the cookie directly in the browser — no server round trip. Tailwind v4 is switched from OS-based to class-based dark via `@custom-variant`. Converted files gain `dark:` variants alongside their existing utilities, leaving the light theme byte-identical.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4, Tailwind CSS 4.2.3, lucide-react, vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-12-dark-mode-preference-design.md`

---

## Conventions for every task

- Run all commands from the repo root, `d:\Games\Ebright_OSC_V2`.
- The dev server is expected to be running (`npm run dev` on port 3000). Turbopack hot-reloads these changes; no restart is needed.
- **Never remove an existing utility class.** Every change in Tasks 5–9 *adds* a `dark:` variant next to what is already there. The only deliberate deletions are the two hardcoded `bg-slate-50` classes in `layout.tsx` (Task 3), which would otherwise override the dark token.
- Where an identical class string appears more than once in a file, the step says so explicitly and tells you to replace all occurrences.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/theme.ts` (new) | Cookie name, max-age, `Theme` type, `parseTheme()`. The only place that decides what an absent/malformed cookie means. Imported by both server and client. |
| `src/lib/theme.test.ts` (new) | Unit tests for `parseTheme` and the exported constants. |
| `src/app/globals.css` | Declares the class-based `dark` variant and the dark token values. |
| `src/app/layout.tsx` | Reads the cookie server-side; applies the `dark` class to `<html>`. |
| `src/app/components/ThemeToggle.tsx` (new) | The sun/moon button. Stateless — toggles the class and writes the cookie. |
| `src/app/components/TopBar.tsx` | Mounts the toggle; dark variants for the header bar. |
| `src/app/components/AppShell.tsx` | Dark variants for shell backgrounds. |
| `src/app/components/Sidebar.tsx` | Dark variants for the nav rail and its flyouts. |
| `src/app/components/UserHeader.tsx` | Dark variants for the avatar dropdown and user picker. |
| `src/app/profile/page.tsx` | Dark variants for the pilot page, including its `Section`/`Item` helpers. |
| `src/app/components/ProfileOrgUnit.tsx` | Dark variants, including the `<select>` control. |

---

## Task 1: Theme module

**Files:**
- Create: `src/lib/theme.ts`
- Test: `src/lib/theme.test.ts`

Vitest runs in a `node` environment and does **not** use globals — every test file imports `describe`/`it`/`expect` from `vitest` explicitly. `vitest.config.ts` includes `src/**/*.test.ts`, so a colocated test file is picked up automatically.

- [ ] **Step 1: Write the failing test**

Create `src/lib/theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "./theme";

describe("parseTheme", () => {
  it("returns dark for the dark cookie value", () => {
    expect(parseTheme("dark")).toBe("dark");
  });

  it("returns light for the light cookie value", () => {
    expect(parseTheme("light")).toBe("light");
  });

  it("defaults to light when no cookie is set", () => {
    expect(parseTheme(undefined)).toBe("light");
  });

  it("defaults to light when the cookie is empty", () => {
    expect(parseTheme("")).toBe("light");
  });

  it("defaults to light for a malformed value", () => {
    expect(parseTheme("purple")).toBe("light");
  });

  it("is case sensitive — only exact 'dark' counts", () => {
    expect(parseTheme("DARK")).toBe("light");
  });
});

describe("cookie constants", () => {
  it("uses a stable cookie name", () => {
    expect(THEME_COOKIE).toBe("theme");
  });

  it("keeps the preference for one year", () => {
    expect(THEME_COOKIE_MAX_AGE).toBe(31536000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/theme.test.ts`

Expected: FAIL — the run errors while collecting the file, with a message like `Failed to resolve import "./theme"`. The module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/theme.ts`:

```ts
/** Name of the cookie holding the user's theme preference. */
export const THEME_COOKIE = "theme";

/** One year in seconds — the preference should outlive any single session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark";

/**
 * Resolve a raw cookie value to a theme.
 *
 * Anything that is not exactly "dark" — a missing cookie, an empty string, a
 * stale or tampered value — falls back to light. Light is the product default
 * while dark-mode coverage is still partial, so users only ever land in dark
 * by explicitly opting in.
 *
 * This is the single place that decision is made, so the server-rendered class
 * and the client's view of the preference cannot drift apart.
 */
export function parseTheme(value: string | undefined | null): Theme {
  return value === "dark" ? "dark" : "light";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/theme.test.ts`

Expected: PASS — `Test Files 1 passed`, `Tests 8 passed`.

- [ ] **Step 5: Confirm the wider suite is unaffected**

Run: `npm test`

Expected: the full suite passes. Note any pre-existing failures before your change and confirm you did not add new ones.

- [ ] **Step 6: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat(theme): add theme cookie module with light default"
```

---

## Task 2: Class-based dark variant and dark tokens

**Files:**
- Modify: `src/app/globals.css`

Tailwind v4 has no `darkMode` config key. Its `dark:` variant defaults to `prefers-color-scheme`, so class-based dark must be declared in CSS with `@custom-variant`. There are currently **zero** real `dark:` variants in `src/`, so this switch changes no existing rendering.

- [ ] **Step 1: Replace the top of the file**

In `src/app/globals.css`, replace:

```css
@import "tailwindcss";

:root {
  --background: #f8fafc; /* slate-50 — matches AppShell so no white bleed-through */
  --foreground: #171717;
}
```

with:

```css
@import "tailwindcss";

/* Tailwind v4 resolves `dark:` against prefers-color-scheme by default. This
   switches it to the class strategy so the server-rendered `dark` class on
   <html> is what decides the theme. */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #f8fafc; /* slate-50 — matches AppShell so no white bleed-through */
  --foreground: #171717;
}

.dark {
  --background: #020617; /* slate-950 — matches the dark shell */
  --foreground: #f1f5f9; /* slate-100 */
}
```

Leave the rest of the file (`@theme inline`, the `html, body` rule, and the `input[type="time"]` rule) exactly as it is. `html, body` already read `var(--background)` / `var(--foreground)`, so base page colours now follow the class automatically.

- [ ] **Step 2: Verify the stylesheet still compiles**

With the dev server running:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login`

Expected: `200`. A malformed `@custom-variant` would surface as a build error and a 500.

- [ ] **Step 3: Verify light mode is visually unchanged**

Open `http://localhost:3000/login` in the browser. It must look exactly as before — no colour shift. Nothing has a `dark` class yet, so this proves the variant declaration is inert until opted in.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): switch tailwind to class-based dark, add dark tokens"
```

---

## Task 3: Root layout applies the theme server-side

**Files:**
- Modify: `src/app/layout.tsx`

`cookies()` is async in Next 16 and readable in Server Components. Reading it here opts the app into dynamic rendering — an accepted trade-off recorded in §8 of the spec.

- [ ] **Step 1: Add the imports**

In `src/app/layout.tsx`, after the existing `import Providers from "./Providers";` line, add:

```tsx
import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
```

- [ ] **Step 2: Make the layout async and apply the class**

Replace the whole `RootLayout` function:

```tsx
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased bg-slate-50`}
      suppressHydrationWarning
    >
```

with:

```tsx
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved on the server so the very first paint is already the right theme —
  // this is what removes the flash, with no blocking inline script.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased ${
        theme === "dark" ? "dark" : ""
      }`}
      suppressHydrationWarning
    >
```

Note the deliberate removal of `bg-slate-50` from the `<html>` class list. It would override `var(--background)` and keep the page light even in dark mode.

- [ ] **Step 3: Remove the hardcoded body background**

In the same file, replace:

```tsx
      <body
        className="h-full overflow-hidden flex flex-col bg-slate-50"
        suppressHydrationWarning
      >
```

with:

```tsx
      <body
        className="h-full overflow-hidden flex flex-col"
        suppressHydrationWarning
      >
```

The `html, body` rule in `globals.css` supplies the background from the token.

- [ ] **Step 4: Verify the server honours the cookie**

Run both commands:

```bash
curl -s http://localhost:3000/login | grep -o 'class="[^"]*antialiased[^"]*"'
curl -s -H "Cookie: theme=dark" http://localhost:3000/login | grep -o 'class="[^"]*antialiased[^"]*"'
```

Expected: the first prints an `<html>` class list **without** `dark`; the second prints one **ending in `dark`**. This proves the server-side read works before any UI exists to set the cookie.

- [ ] **Step 5: Verify a malformed cookie falls back to light**

Run: `curl -s -H "Cookie: theme=purple" http://localhost:3000/login | grep -o 'class="[^"]*antialiased[^"]*"'`

Expected: no `dark` in the class list.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(theme): apply theme class from cookie in root layout"
```

---

## Task 4: The sun/moon toggle

**Files:**
- Create: `src/app/components/ThemeToggle.tsx`
- Modify: `src/app/components/TopBar.tsx`

The component is deliberately **stateless**. Which icon shows is decided by CSS from the `dark` class, not by React state. That means the icon can never disagree with the rendered theme, there is no hydration mismatch, and no wrong icon flashes on load. This is a refinement of spec §4.3 that reaches the same goal — the DOM class stays the single authority — more simply.

- [ ] **Step 1: Create the component**

Create `src/app/components/ThemeToggle.tsx`:

```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/lib/theme";

/**
 * Two-state light/dark switch.
 *
 * Toggling flips the class on <html> for an instant repaint and writes the
 * cookie so the server renders the same theme on the next request. There is no
 * server action and no re-render — the class on <html> is the single source of
 * truth, and the icons are chosen from it by CSS rather than by React state.
 */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <Sun className="w-5 h-5 dark:hidden" aria-hidden="true" />
      <Moon className="w-5 h-5 hidden dark:block" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 2: Mount it in the TopBar**

In `src/app/components/TopBar.tsx`, add the import below the existing `NotificationBell` import:

```tsx
import ThemeToggle from "./ThemeToggle";
```

Then replace:

```tsx
        <div className="shrink-0 flex items-center gap-1">
          <NotificationBell role={role} />
          <UserHeader email={email} role={role} name={name} />
        </div>
```

with:

```tsx
        <div className="shrink-0 flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell role={role} />
          <UserHeader email={email} role={role} name={name} />
        </div>
```

- [ ] **Step 3: Verify the toggle works end to end**

Log in and open any page with the app shell (e.g. `http://localhost:3000/home`). Then:

1. A sun icon appears to the left of the notification bell.
2. Click it — the page background turns dark immediately, with no reload, and the icon becomes a moon.
3. In DevTools → Application → Cookies, `theme` is `dark`.
4. Hard-refresh (Ctrl+Shift+R) — the page is **still dark from the very first paint**, with no white flash.
5. Click again — back to light, cookie is `light`, and refresh keeps it light.

At this stage only the base background changes; the shell is converted next.

- [ ] **Step 4: Verify no hydration warning**

Check the Next dev overlay and the browser console. Expected: no hydration mismatch errors from `ThemeToggle`.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ThemeToggle.tsx src/app/components/TopBar.tsx
git commit -m "feat(theme): add sun/moon toggle to the top bar"
```

---

## Task 5: Dark variants for AppShell and TopBar

**Files:**
- Modify: `src/app/components/AppShell.tsx`
- Modify: `src/app/components/TopBar.tsx`

- [ ] **Step 1: AppShell — outer container**

Replace:

```tsx
      <div className="flex h-screen bg-slate-50 overflow-hidden">
```

with:

```tsx
      <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
```

- [ ] **Step 2: AppShell — mobile drawer backdrop**

Replace:

```tsx
            className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-200 ${
```

with:

```tsx
            className={`absolute inset-0 bg-slate-900/50 dark:bg-slate-950/70 transition-opacity duration-200 ${
```

- [ ] **Step 3: AppShell — main scroll area**

Replace:

```tsx
          <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
```

with:

```tsx
          <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">{children}</main>
```

- [ ] **Step 4: TopBar — header bar**

Replace:

```tsx
    <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur border-b border-slate-200">
```

with:

```tsx
    <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
```

- [ ] **Step 5: TopBar — sidebar toggle button**

Replace:

```tsx
          className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
```

with:

```tsx
          className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
```

- [ ] **Step 6: Verify**

With dark mode on, reload `/home`. The header bar and page background are dark; the sidebar is still white (converted next). Toggle to light and confirm the shell is pixel-identical to before.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/AppShell.tsx src/app/components/TopBar.tsx
git commit -m "style(theme): dark variants for app shell and top bar"
```

---

## Task 6: Dark variants for the Sidebar

**Files:**
- Modify: `src/app/components/Sidebar.tsx`

Two class strings in this file appear **twice** (the flyout popover container, and the active-nav pair). Each step below says which case applies.

- [ ] **Step 1: The rail itself**

Replace:

```tsx
      className={`bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-200 ${
```

with:

```tsx
      className={`bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 transition-[width] duration-200 ${
```

- [ ] **Step 2: Logo header border**

Replace:

```tsx
        className={`flex items-center h-16 border-b border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
```

with:

```tsx
        className={`flex items-center h-16 border-b border-slate-200 dark:border-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
```

- [ ] **Step 3: Section divider**

Replace:

```tsx
        <div className="my-3 mx-3 border-t border-slate-100" />
```

with:

```tsx
        <div className="my-3 mx-3 border-t border-slate-100 dark:border-slate-800" />
```

- [ ] **Step 4: Section label**

Replace:

```tsx
        <p className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
```

with:

```tsx
        <p className="px-3 mb-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
```

- [ ] **Step 5: Nav icon colours**

Replace:

```tsx
        isActive || hasActiveDescendant ? "text-blue-600" : "text-slate-500"
```

with:

```tsx
        isActive || hasActiveDescendant
          ? "text-blue-600 dark:text-blue-400"
          : "text-slate-500 dark:text-slate-400"
```

- [ ] **Step 6: Collapsed icon-button states**

Replace:

```tsx
      isActive || hasActiveDescendant || flyoutOpen
        ? "bg-blue-50 text-blue-700"
        : "text-slate-700 hover:bg-slate-100"
    }`;
```

with:

```tsx
      isActive || hasActiveDescendant || flyoutOpen
        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;
```

The trailing `}\`;` is included to make this match unique — the shorter `"bg-blue-50 text-blue-700"` string also occurs in Step 9, so matching on it alone would be ambiguous.

- [ ] **Step 7: Flyout popover containers — BOTH occurrences**

This exact string appears **twice** (once for the collapsed-rail flyout, once for the cascading sub-flyout). Replace **all** occurrences of:

```tsx
                className="z-50 min-w-56 rounded-lg border border-slate-200 bg-white py-2 shadow-lg"
```

and

```tsx
              className="z-50 min-w-56 rounded-lg border border-slate-200 bg-white py-2 shadow-lg"
```

so that in both cases the class list becomes:

```
z-50 min-w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 shadow-lg
```

Note the two occurrences differ only in leading indentation. If your editor tool requires unique matches, use its replace-all option on the class string itself.

- [ ] **Step 8: Flyout heading**

Replace:

```tsx
                <p className="px-3 pb-2 mb-1 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
```

with:

```tsx
                <p className="px-3 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
```

- [ ] **Step 9: Expanded nav row states**

Replace:

```tsx
    isActive
      ? "bg-blue-50 text-blue-700"
      : hasActiveDescendant
        ? "text-blue-700 hover:bg-slate-100"
        : `${depth === 0 ? "text-slate-700" : "text-slate-600"} hover:bg-slate-100`
  }`;
```

with:

```tsx
    isActive
      ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      : hasActiveDescendant
        ? "text-blue-700 hover:bg-slate-100 dark:text-blue-300 dark:hover:bg-slate-800"
        : `${depth === 0 ? "text-slate-700 dark:text-slate-300" : "text-slate-600 dark:text-slate-400"} hover:bg-slate-100 dark:hover:bg-slate-800`
  }`;
```

- [ ] **Step 10: Cascading flyout chevron**

Replace:

```tsx
          <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
```

with:

```tsx
          <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
```

- [ ] **Step 11: Verify**

In dark mode on `/home`:
1. The sidebar is dark with a visible right border.
2. The active nav item reads as blue-on-dark, not blue-on-white.
3. Hovering a nav item gives a subtle dark highlight, not a white one.
4. Collapse the rail (top-bar panel icon) and click a parent icon — the flyout popover is dark.
5. Toggle to light and confirm the sidebar is identical to before.

- [ ] **Step 12: Commit**

```bash
git add src/app/components/Sidebar.tsx
git commit -m "style(theme): dark variants for the sidebar and its flyouts"
```

---

## Task 7: Dark variants for the avatar dropdown

**Files:**
- Modify: `src/app/components/UserHeader.tsx`

- [ ] **Step 1: Avatar trigger button**

Replace:

```tsx
        className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
```

with:

```tsx
        className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
```

- [ ] **Step 2: Trigger name label**

Replace:

```tsx
        <span className="text-sm font-medium text-slate-700 hidden sm:block max-w-[160px] truncate">
```

with:

```tsx
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block max-w-[160px] truncate">
```

- [ ] **Step 3: Dropdown panel**

Replace:

```tsx
          className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden"
```

with:

```tsx
          className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 z-50 overflow-hidden"
```

- [ ] **Step 4: Profile header block**

Replace:

```tsx
              <div className="px-4 py-4 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">{activeDisplayName}</p>
                <div className="mt-0.5 flex items-center gap-2 min-w-0">
                  <span className="text-xs text-slate-500 truncate">{activeEmail}</span>
```

with:

```tsx
              <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{activeDisplayName}</p>
                <div className="mt-0.5 flex items-center gap-2 min-w-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{activeEmail}</span>
```

- [ ] **Step 5: Role badge**

Replace:

```tsx
                    <span className="inline-flex items-center shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 uppercase tracking-wider">
```

with:

```tsx
                    <span className="inline-flex items-center shrink-0 rounded-md bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-200 dark:ring-blue-900 uppercase tracking-wider">
```

- [ ] **Step 6: Nav links — ALL THREE occurrences**

This exact class string appears **three times** (Home, My Profile, Approvals). Replace **all** occurrences of:

```
flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors
```

with:

```
flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors
```

Use your editor tool's replace-all option.

- [ ] **Step 7: Nav link icons — ALL THREE occurrences**

The icon class appears **three times** (`Home`, `User`, `ShieldCheck`). Replace **all** occurrences of:

```
className="w-4 h-4 text-slate-400" aria-hidden="true"
```

with:

```
className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true"
```

- [ ] **Step 8: "Login As" row**

Replace:

```tsx
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-indigo-50 transition-colors group"
```

with:

```tsx
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors group"
```

- [ ] **Step 9: Log out block**

Replace:

```tsx
              <div className="border-t border-slate-100 py-1.5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
```

with:

```tsx
              <div className="border-t border-slate-100 dark:border-slate-800 py-1.5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors font-medium"
```

- [ ] **Step 10: User picker — header, search and filters**

This panel is superadmin-only. Skipping it would leave a white block for superadmins in dark mode.

Replace:

```tsx
              <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100 shrink-0">
                <button
                  onClick={() => setLoginAsOpen(false)}
                  className="p-1 rounded-md hover:bg-slate-100 transition-colors shrink-0"
                  aria-label="Back to menu"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                </button>
                <span className="flex-1 text-sm font-semibold text-slate-800">Login as user</span>
```

with:

```tsx
              <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  onClick={() => setLoginAsOpen(false)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  aria-label="Back to menu"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </button>
                <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Login as user</span>
```

Then replace:

```tsx
              <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 space-y-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
```

with:

```tsx
              <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 dark:border-slate-800 space-y-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
```

Then the search input — replace:

```tsx
                    className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white placeholder:text-slate-400"
```

with:

```tsx
                    className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
```

Then the role filter pills — replace:

```tsx
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
```

with:

```tsx
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
```

- [ ] **Step 11: User picker — list rows and empty states**

In the `UserRow` component, replace:

```tsx
      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-default text-left group"
    >
      <span className="w-7 h-7 shrink-0 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-semibold text-xs group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
        {uInitials}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
        <p className="text-xs text-slate-400 truncate">{u.email}</p>
      </div>
```

with:

```tsx
      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-default text-left group"
    >
      <span className="w-7 h-7 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-semibold text-xs group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950 dark:group-hover:text-indigo-300 transition-colors">
        {uInitials}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{u.name}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{u.email}</p>
      </div>
```

Then the role chip — replace:

```tsx
        <span className="shrink-0 text-[10px] font-medium text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
```

with:

```tsx
        <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">
```

Then the two loading/empty messages — this string appears **twice** ("Loading…" and "No users found"). Replace **all** occurrences of:

```
className="text-xs text-slate-400 text-center py-8"
```

with:

```
className="text-xs text-slate-400 dark:text-slate-500 text-center py-8"
```

Then the role group heading — replace:

```tsx
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
```

with:

```tsx
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
```

- [ ] **Step 12: Verify**

In dark mode, click the avatar. The dropdown panel, its header, nav rows, hover states and the log-out row are all dark and readable. If you have a superadmin account, open "Login As" and confirm the picker, search box and role pills are dark too. Toggle to light and confirm nothing changed from before.

- [ ] **Step 13: Commit**

```bash
git add src/app/components/UserHeader.tsx
git commit -m "style(theme): dark variants for the avatar dropdown and user picker"
```

---

## Task 8: Dark variants for the profile page

**Files:**
- Modify: `src/app/profile/page.tsx`

The `Section` and `Item` helpers at the bottom of the file render most of the page, so converting them covers the bulk of it.

- [ ] **Step 1: Page background and breadcrumb**

Replace:

```tsx
      <div className="min-h-full bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="text-slate-900 font-medium">My Profile</span>
```

with:

```tsx
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
            <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <span className="text-slate-900 dark:text-slate-100 font-medium">My Profile</span>
```

- [ ] **Step 2: Success banners — ALL THREE occurrences**

This exact class string appears **three times** (password changed, email updated, profile updated). Replace **all** occurrences of:

```
mb-5 flex items-start gap-2 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-800
```

with:

```
mb-5 flex items-start gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 text-sm text-emerald-800 dark:text-emerald-200
```

- [ ] **Step 3: Identity header card**

Replace:

```tsx
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start justify-between gap-4 flex-wrap">
```

with:

```tsx
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex items-start justify-between gap-4 flex-wrap">
```

Then replace:

```tsx
                <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight truncate">
                  {displayName}
                </h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-sm text-slate-500 truncate">{me.email}</span>
                  {roleType !== "staff" && (
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 uppercase tracking-wider">
```

with:

```tsx
                <h1 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight truncate">
                  {displayName}
                </h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{me.email}</span>
                  {roleType !== "staff" && (
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-200 dark:ring-blue-900 uppercase tracking-wider">
```

- [ ] **Step 4: Change Password button**

Replace:

```tsx
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
```

with:

```tsx
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
```

- [ ] **Step 5: Account section's inline Email row**

Replace:

```tsx
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center justify-between gap-2">
                  <span>Email</span>
                  <Link
                    href="/profile/edit-email"
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline normal-case tracking-normal"
                  >
                    Edit
                  </Link>
                </dt>
                <dd className="mt-1 text-sm text-slate-900 break-words">{me.email}</dd>
```

with:

```tsx
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between gap-2">
                  <span>Email</span>
                  <Link
                    href="/profile/edit-email"
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline normal-case tracking-normal"
                  >
                    Edit
                  </Link>
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100 break-words">{me.email}</dd>
```

- [ ] **Step 6: Superadmin "Profile" section**

Replace:

```tsx
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-blue-600" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Profile</h2>
                    <p className="text-sm text-slate-500">Department profile and team members.</p>
```

with:

```tsx
              <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Profile</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Department profile and team members.</p>
```

- [ ] **Step 7: Team members list**

Replace:

```tsx
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Team members {team.length > 0 && <span className="text-slate-400 normal-case tracking-normal font-normal">({team.length})</span>}
                  </h3>
                  {team.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      No other members in the Optimisation department yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
```

with:

```tsx
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    Team members {team.length > 0 && <span className="text-slate-400 dark:text-slate-500 normal-case tracking-normal font-normal">({team.length})</span>}
                  </h3>
                  {team.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      No other members in the Optimisation department yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
```

Then the member rows — replace:

```tsx
                            <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0">
                              {initials}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-900 truncate">{name}</div>
                              <div className="text-xs text-slate-500 truncate">{m.email}</div>
                            </div>
```

with:

```tsx
                            <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center shrink-0">
                              {initials}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.email}</div>
                            </div>
```

Then the position chip — replace:

```tsx
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 whitespace-nowrap">
```

with:

```tsx
                                <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 whitespace-nowrap">
```

Then the status pill — replace:

```tsx
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"}`}>
```

with:

```tsx
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.status === "active" ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20"}`}>
```

- [ ] **Step 8: The `Section` helper**

Replace:

```tsx
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-blue-600" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </header>
```

with:

```tsx
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </header>
```

- [ ] **Step 9: The `Item` helper**

Replace:

```tsx
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 ${mono ? "tabular-nums" : ""} break-words`}>
```

with:

```tsx
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 dark:text-slate-100 ${mono ? "tabular-nums" : ""} break-words`}>
```

- [ ] **Step 10: Verify**

Open `http://localhost:3000/profile` in dark mode. Every section card is dark with readable labels and values; the breadcrumb, identity card, role badge and Change Password button all read correctly. Toggle to light and confirm the page is identical to before this task.

- [ ] **Step 11: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "style(theme): dark variants for the profile page"
```

---

## Task 9: Dark variants for ProfileOrgUnit

**Files:**
- Modify: `src/app/components/ProfileOrgUnit.tsx`

This card only renders for roles that can edit their org unit, but it sits on the profile page and would otherwise be a white block on a dark background. The `<select>` needs an explicit dark background or the browser renders a white control.

- [ ] **Step 1: Card and header**

Replace:

```tsx
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-blue-600" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{onlyBranches ? "Assigned Branch" : "Managed Branch / Department"}</h2>
          <p className="text-sm text-slate-500">
```

with:

```tsx
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{onlyBranches ? "Assigned Branch" : "Managed Branch / Department"}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
```

- [ ] **Step 2: Error and success alerts**

Replace:

```tsx
          <div role="alert" className="flex items-start gap-2 p-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-800">
```

with:

```tsx
          <div role="alert" className="flex items-start gap-2 p-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-sm text-red-800 dark:text-red-200">
```

Then replace:

```tsx
          <div role="status" className="flex items-start gap-2 p-3 rounded-md border border-emerald-200 bg-emerald-50 text-sm text-emerald-800">
```

with:

```tsx
          <div role="status" className="flex items-start gap-2 p-3 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 text-sm text-emerald-800 dark:text-emerald-200">
```

- [ ] **Step 3: Field label**

Replace:

```tsx
          <span className="block text-sm font-medium text-slate-700 mb-1.5">
```

with:

```tsx
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
```

- [ ] **Step 4: The select control and its chevron**

Replace:

```tsx
              className="block w-full h-10 px-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
```

with:

```tsx
              className="block w-full h-10 px-3 pr-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
```

Then replace:

```tsx
            <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
```

with:

```tsx
            <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 rotate-90" aria-hidden="true" />
```

- [ ] **Step 5: Verify**

Sign in as a role that can edit its org unit (branch, department, HOD or regional manager). On `/profile` in dark mode, the card is dark and the dropdown control is dark with light text — not a white box. Open the dropdown and confirm the options are legible.

If you cannot access such an account, say so when reporting rather than claiming this was verified.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ProfileOrgUnit.tsx
git commit -m "style(theme): dark variants for the org unit card"
```

---

## Task 10: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run the test suite**

Run: `npm test`

Expected: passes, including the 8 theme tests. Compare against the pre-existing baseline from Task 1 Step 5.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: no new errors in the files you touched. Note that `next.config.ts` has an unused `path` import that predates this work — leave it alone.

- [ ] **Step 3: Work the spec's manual checklist**

Confirm each item and record the result:

1. Toggle to dark → shell and `/profile` render dark immediately, no reload.
2. Hard-refresh → still dark, **no white flash** on first paint.
3. Client-side navigate away and back → the preference holds.
4. Toggle to light → `/profile` is visually identical to before this work.
5. An unconverted page (e.g. `/attendance`) still renders correctly in light mode.
6. No hydration warnings in the dev overlay or browser console.

- [ ] **Step 4: Confirm the light theme really is untouched**

Run: `git diff main --stat -- src/`

Then spot-check one converted file with `git diff main -- src/app/profile/page.tsx`. Every styling change must be an **addition** of `dark:` variants. The only removals anywhere should be the two `bg-slate-50` classes in `layout.tsx`. If any other light-mode class was removed or altered, restore it.

- [ ] **Step 5: Report**

Summarise: which checklist items passed, anything you could not verify (e.g. the superadmin picker or the org-unit card if you lacked the role), and any follow-up worth noting. Do not claim verification you did not perform.

---

## Out of scope

Per spec §9 — do not attempt these here:

- The remaining ~145 files that hardcode light colours.
- Chart.js palettes (`BarChart`, `DonutChart`) and generated PDF styling.
- `apps/cep` and `apps/onboarding-training` (separate apps with their own configs).
- Cross-device sync, a "System"/OS-following mode, or any other user preference.
