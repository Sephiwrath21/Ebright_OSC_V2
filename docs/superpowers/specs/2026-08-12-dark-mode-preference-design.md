# Dark Mode Preference — Design

- **Date:** 2026-08-12
- **Status:** Approved (design reviewed in brainstorming session)
- **Scope:** Preference mechanism + app shell + `/profile` pilot conversion

## 1. Summary

Add a user-facing light/dark preference to the OSC portal. The preference is
two-state (light or dark), defaults to light, persists in a cookie, and is
applied as a `dark` class on `<html>`. Users flip it with a sun/moon icon
button in the TopBar.

This pass delivers the **mechanism plus a pilot conversion**: the app shell
(AppShell, TopBar, Sidebar, UserHeader) and the `/profile` page get real dark
styling. The remaining ~145 files that hardcode light colours are deliberately
left for follow-up work, following the palette contract established here.

The app currently has **no dark-mode groundwork whatsoever**, so this design
covers both "how the preference works" and "how a file gets converted".

## 2. Decisions log

| Decision | Outcome |
|---|---|
| Pass scope | **Mechanism + pilot area** (chosen over mechanism-only and over a full ~147-file sweep) |
| Storage | **Cookie** (chosen over a `user_profile` DB column and over localStorage) |
| Cross-device sync | **No** — per-device by design; a DB column was rejected to avoid a schema change on a drifted database |
| Modes offered | **Light / Dark only.** "System" was considered and **dropped** — supersedes the earlier three-mode answer |
| Default for new users | **Light** — nobody lands in dark without opting in while the conversion is partial |
| Control | **Sun/moon icon button in the TopBar** (chosen over a menu item in the avatar dropdown and over a profile-page section) |
| Pilot page | **`/profile`** (chosen over `/home`, which drags in chart palettes, and `/task-manager`, the largest surface) |
| Styling method | **Additive `dark:` variant pairs** (chosen over a semantic-token rewrite) |
| `apps/cep` | **Out of scope** — isolated app, own config and own `prefers-color-scheme` block |

## 3. Grounding facts (verified 2026-08-12)

- Next.js **16.2.4**, React 19.2.4, Tailwind **4.2.3**, next-auth v5 beta,
  `lucide-react` ^1.8.0 (`sun` and `moon` icons both present).
- `cookies()` in Next 16 is **async**. It is readable in Server Components and
  writable only from Server Functions / Route Handlers. Reading it in a layout
  **opts the route into dynamic rendering**. (Source: bundled
  `node_modules/next/dist/docs/.../functions/cookies.md`.)
- Tailwind v4's `dark:` variant defaults to `prefers-color-scheme`. Class-based
  dark requires an explicit `@custom-variant` declaration in CSS — there is no
  `darkMode` config key as in v3.
- **Zero real Tailwind `dark:` variants exist in `src/`.** The 7 grep hits are
  TypeScript object keys (`{ dark: string; light: string }`) in
  `HrPersonalizedDashboard.tsx`, not variants. Switching to the class strategy
  therefore changes no existing rendering.
- 147 of 280 `.tsx` files under `src/` and `apps/` reference `bg-white`.
- `src/app/globals.css` already defines `--background` / `--foreground` and maps
  them through `@theme inline`.
- `src/app/layout.tsx` hardcodes `bg-slate-50` on both `<html>` and `<body>`, and
  already sets `suppressHydrationWarning` on both.
- `TopBar.tsx` renders `NotificationBell` and `UserHeader` in a right-aligned
  flex row — the insertion point for the toggle.
- `/profile` builds its UI from repeated section cards styled
  `bg-white rounded-xl border border-slate-200 shadow-sm`.

## 4. Architecture

### 4.1 Data flow

```
Browser click
  └─> ThemeToggle (client)
        ├─ toggles `dark` class on <html>   → instant repaint, no re-render
        └─ writes `theme` cookie            → document.cookie
Next request
  └─> RootLayout (server, async)
        └─ cookies().get("theme") → className={theme === "dark" ? "dark" : ""}
              → first paint already correct, no flash
```

The toggle deliberately does **not** call a Server Action. Writing the cookie
from the browser and toggling the class directly makes the switch instant and
avoids a server round trip plus full re-render on every flip. The server only
needs the value on the *next* request, which the cookie satisfies.

### 4.2 Units and responsibilities

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/lib/theme.ts` (new) | Owns the cookie name, the `Theme` type, `parseTheme()`, and cookie max-age. Single source of truth shared by server and client. | nothing |
| `src/app/layout.tsx` | Reads the cookie server-side, puts `dark` on `<html>`. | `theme.ts`, `next/headers` |
| `src/app/globals.css` | Declares the class-based dark variant and dark token values. | Tailwind |
| `ThemeToggle.tsx` (new) | Renders the sun/moon button; owns the click behaviour and cookie write. | `theme.ts`, `lucide-react` |
| `TopBar.tsx` | Mounts the toggle. | `ThemeToggle` |

`parseTheme()` is the only place that decides what an absent or malformed cookie
means, so the default-to-light rule cannot drift between server and client.

### 4.3 Avoiding desync

`ThemeToggle` initialises its state by **reading the actual `dark` class off
`<html>`** on mount, not from its own cookie parse. The server has already
decided the theme by the time the component hydrates; reading the DOM makes the
server the single authority and removes any possibility of the button showing a
sun while the page renders dark.

### 4.4 CSS strategy

Add to `globals.css`:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

This switches every `dark:` utility from OS-based to class-based. Dark values for
the existing tokens are declared under a `.dark` selector so the current
`@theme inline` mapping keeps working unchanged:

```css
.dark {
  --background: #020617; /* slate-950 — matches the shell, no light bleed-through */
  --foreground: #f1f5f9; /* slate-100 */
}
```

`html, body` keep using `var(--background)` / `var(--foreground)`, so the base
page colours follow the class automatically. The hardcoded `bg-slate-50` classes
currently on `<html>` and `<body>` in `layout.tsx` are removed, since they would
otherwise override the token in dark mode.

## 5. Palette contract

Converted files add `dark:` variants **alongside** existing utilities rather
than replacing them. A semantic-token rewrite would touch every colour in all
147 files at once; additive pairs leave the light theme byte-identical and keep
each diff reviewable. The cost is verbosity, accepted deliberately.

| Role | Light (existing) | Dark |
|---|---|---|
| Page background | `bg-slate-50` | `dark:bg-slate-950` |
| Card / surface | `bg-white` | `dark:bg-slate-900` |
| Raised / hover surface | `bg-slate-100` | `dark:bg-slate-800` |
| Border | `border-slate-200` | `dark:border-slate-800` |
| Primary text | `text-slate-900` | `dark:text-slate-100` |
| Secondary text | `text-slate-700` | `dark:text-slate-300` |
| Muted text | `text-slate-600` / `text-slate-500` | `dark:text-slate-400` |
| Hover background | `hover:bg-slate-100` | `dark:hover:bg-slate-800` |
| Accent (links, active nav) | `blue-600` | `dark:text-blue-400` where contrast requires |

Blue accent backgrounds (e.g. the active-nav indicator `bg-blue-600`) stay
unchanged — they carry sufficient contrast on a slate-900 surface.

## 6. Files touched

**New**
- `src/lib/theme.ts`
- `src/app/components/ThemeToggle.tsx`
- `src/lib/theme.test.ts`

**Changed**
- `src/app/globals.css` — dark variant + dark token values
- `src/app/layout.tsx` — async, reads cookie, applies class, drops hardcoded `bg-slate-50`
- `src/app/components/TopBar.tsx` — mount toggle; dark variants
- `src/app/components/AppShell.tsx` — dark variants on shell backgrounds
- `src/app/components/Sidebar.tsx` — dark variants
- `src/app/components/UserHeader.tsx` — dark variants on the dropdown
- `src/app/profile/page.tsx` — dark variants on section cards and text
- `src/app/components/ProfileOrgUnit.tsx` — 7 light-only colour utilities, including a
  `<select>` control (`border-slate-200 bg-white text-slate-900`) that needs a dark
  variant so the dropdown does not render as a white block on a dark card

## 7. Testing

**Automated** (vitest, already configured):
- `parseTheme("dark")` → `"dark"`
- `parseTheme("light")` → `"light"`
- `parseTheme(undefined)` → `"light"` (no cookie set)
- `parseTheme("purple")` → `"light"` (malformed value)

**Manual verification checklist:**
1. Toggle to dark → shell and `/profile` render dark immediately, no reload.
2. Hard-refresh → still dark, **no white flash** on first paint.
3. Client-side navigate to another page and back → preference holds.
4. Toggle back to light → `/profile` is visually identical to before this change.
5. An unconverted page (e.g. `/attendance`) still renders correctly in light mode.
6. No hydration warnings in the dev overlay.

## 8. Risks and trade-offs

- **Dynamic rendering.** Reading cookies in the root layout opts the app into
  dynamic rendering. Impact here is minimal — the portal is entirely auth-gated
  and pages like `/profile` already declare `export const dynamic = "force-dynamic"`
  — but it is a real behavioural change and is called out deliberately.
- **Deliberately partial coverage.** After this pass, dark mode users see a dark
  shell and profile page while other screens stay light. This is the accepted
  cost of piloting; default-light means only opt-in users encounter it.
- **Cookie is not `httpOnly`.** The client writes it directly. It holds a
  non-sensitive display preference, so this is acceptable.
- **Per-device only.** A user setting dark on desktop still gets light on mobile.
  Accepted to avoid a schema change on a database with known drift.

## 9. Out of scope

- Converting the remaining ~145 light-only files.
- Chart.js / `BarChart` / `DonutChart` palettes and generated PDF styling.
- `apps/cep` and `apps/onboarding-training` (separate apps, own configs).
- Cross-device sync, a "System"/OS-following mode, and any other user preference.

## 10. Follow-up

Once the palette proves out on `/profile`, remaining areas convert
area-by-area against the §5 contract — dashboards (plus chart colours),
task manager, CRM, attendance, HR. Flipping the default from light to
system-following becomes reasonable only after coverage is broadly complete.
