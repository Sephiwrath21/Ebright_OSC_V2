# Notification architecture — three layers

The app fires messages to parents through three structurally distinct layers. They
share the same low-level send primitives (`lib/send.ts`'s `fireRuleBasedSend` /
`fireBlastSend`, `lib/email.ts`, `SendLog`, `Notification`), but each layer has a
different trigger *source* and a different admin surface. Keeping them conceptually
separate matters as the system grows — don't collapse them into "just automation."

## 1. Conveyer belt (per-parent lifecycle)

**Rules:** Welcome, Follow us, Review, Referral, Renewal, Birthday, Video.

**Trigger source:** each individual parent's own `enrollDate`, offset by a fixed
number of days/months and scaled by their `plan_type` (3/6/9/12mo). Two parents
enrolled on different dates for the same rule fire on different calendar days —
the schedule is relative to the parent, not a shared date.

**Built as:** `AutomationRule` + `AutomationRuleTrigger` rows (`lib/cron.ts`'s main
per-parent loop), configured per plan type via `/admin/rules`. "Weekly" is loosely
used elsewhere in the UI to describe this layer's cadence — it's not a literal
once-a-week mechanism (Birthday fires once a year, Renewal near expiry); the name
just distinguishes it from the shared-date layer below.

## 2. Monthly ad-hoc (shared, calendar-driven)

**Rules:** Festive, Showcase.

**Trigger source:** one shared date for *all* parents (or one branch), not derived
from each parent's own enrollment. Sourced from Cal.com bookings — see
`lib/calcom.ts`, `lib/festiveSync.ts`, `lib/showcaseSync.ts`. A booking titled
`"Festive: <name>"` becomes a `FestiveEvent` row; `"Showcase: <name>"` becomes a
`ShowcaseEvent` row (the distinguishing prefix lives in the booking's
`attendee.name`, not `title` — Cal.com's API doesn't allow setting `title` directly,
see the comment in `lib/calcom.ts`).

**Built as:** `FestiveEvent` / `ShowcaseEvent` rows, synced via
`syncFestiveCalendar()` / `syncShowcaseEvents()` on the same ~daily gate in
`lib/cronScheduler.ts`, fired from their own blocks in `lib/cron.ts`. Key behavioral
difference between the two: a Festive send with no matching Content template falls
back to a generic branded greeting; a Showcase send with no template does **not**
send at all (a showcase needs real logistics, not a placeholder) — it just escalates
an admin reminder as the date approaches.

## 3. Promo (manual/on-demand)

**Rules:** none — no schedule, no calendar source. Sales/marketing pushes an admin
triggers by hand from `/promo`.

**Trigger source:** a human clicking "Send" after picking a Content template and
confirming a filtered audience (branch/status/plan) — not a cron tick, not a
calendar sync.

**Built as:** reuses the same audience-filtering (`components/shared/AudienceFilterPanel.tsx`)
and send mechanism (`fireBlastSend`) as the existing Blast tool, but as a separate
page/nav entry with its own Content-library tag (`triggerType: 'promo'`) so sends
are distinguishable in Queue/Notifications from a manual Blast.

## Why three, not one

Layer 1 answers "where is this parent in their journey." Layer 2 answers "what's
happening on the calendar today, for everyone." Layer 3 answers "what does the
business want to push right now." Each has a different source of truth for *when*
it fires — collapsing them into one undifferentiated "automation" concept would
make it much harder to reason about why a given email went out on a given day.
