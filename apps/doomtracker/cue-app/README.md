# Cue — Ebright showcase runsheets

A workflow tool for Ebright's mall showcase events. Every event is a "runsheet"
that counts down week by week to event day, viewable either as a checklist
(Cue list) or a dependency flow diagram (Cue map). The Dashboard surfaces
every open or overdue cue across all branches so nobody has to dig through
email to find what's due.

## Run it in VS Code

1. Open this folder in VS Code (`File > Open Folder...`).
2. Open a terminal in VS Code (`` Ctrl+` `` / `` Cmd+` ``).
3. Install dependencies:
   ```
   npm install
   ```
4. Start the dev server:
   ```
   npm run dev
   ```
5. Open the URL it prints (usually `http://localhost:5173`).

Any edits you make to files in `src/` will hot-reload in the browser instantly.

## Project structure

```
cue-app/
  src/
    App.jsx        the whole app: dashboard, runsheets, cue list, cue map, directory
    storage.js      persistence layer (see note below)
    main.jsx        React entry point
  index.html
  package.json
```

## About data storage

`src/storage.js` currently saves data to the browser's `localStorage`, so your
runsheets persist between reloads on your machine, but are **not** shared
between different people or devices. That's fine for trying the app out, but
not enough for a real multi-branch tool.

To make it a real team tool, replace the internals of `storage.js` with calls
to a backend of your choice — the `get` / `set` / `delete` / `list` shape can
stay the same, so `App.jsx` won't need to change. Reasonable options:

- **Supabase** or **Firebase** — quickest way to get a shared database and
  optional auth without standing up your own server.
- **A small Node/Express API** in front of a database, if you want full
  control (and likely IT will want this for company data eventually).

## Known simplifications (prototype, not production)

- The "Notify everyone with an open cue" button in the Dashboard **simulates**
  sending email — it shows what would be sent but doesn't actually deliver
  anything yet. Wiring this up would mean adding a backend that calls an email
  provider (e.g. Resend, SendGrid, or your company's Outlook/Gmail via API) on
  a schedule (e.g. every Monday morning).
- Org data (departments, branches, PICs) is hardcoded in `App.jsx` from the
  branch list you uploaded (10 June 2026). If that list changes, update the
  `DEPARTMENTS` and `BRANCHES` arrays near the top of the file — or, longer
  term, load them from a database too.
- The Showcase Mastertracker template (the 14 cues from T-6 weeks to T+1
  week) is a first-draft example. Once you share the real week-by-week
  mastertracker your team uses today, I can swap in the real steps and
  dependencies.
