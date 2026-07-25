/**
 * Syncs FestiveEvent rows from Cal.com (lib/calcom.ts). One Booking = one festival:
 * its ATTENDEE NAME (not title — see lib/calcom.ts for why) must start with
 * "Festive: " (e.g. "Festive: Hari Raya Aidilfitri") to be picked up — bookings
 * without that prefix are ignored (they might be showcase bookings, see
 * lib/showcaseSync.ts, or unrelated noise on the account).
 *
 * Upserts are keyed by the booking's uid (FestiveEvent.externalId), so re-running
 * this never duplicates rows and edits in Cal.com propagate on the next sync. If a
 * booking is cancelled before its send date, the matching FestiveEvent row is
 * deleted too — this cancels the pending send outright (it simply won't be "due"
 * on any future runCron() pass, since the row no longer exists to check).
 */
import { addDays, startOfDay } from 'date-fns';
import { prisma } from './prisma';
import { createNotification } from './notifications';
import { slugify } from './slug';
import { fetchCalcomBookings, isCalcomConfigured, type CalcomBooking } from './calcom';

const FESTIVE_PREFIX = /^festive:\s*/i;

/** Cal.com rejects a `title` field at booking creation — the only freely-settable
 * field is the attendee's name, so that's where the "Festive: <name>" convention lives. */
function attendeeName(b: CalcomBooking): string {
  return b.attendees[0]?.name ?? '';
}

export interface FestiveSyncResult {
  ranSync: boolean;
  synced: number;
  canceled: number;
  error?: string;
}

export async function syncFestiveCalendar(): Promise<FestiveSyncResult> {
  if (!isCalcomConfigured()) {
    return { ranSync: false, synced: 0, canceled: 0 };
  }

  const today = startOfDay(new Date());
  const timeMin = addDays(today, -1);
  const timeMax = addDays(today, 400); // one festival cycle plus buffer

  let bookings: CalcomBooking[];
  try {
    bookings = await fetchCalcomBookings(timeMin, timeMax);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[festiveSync] failed to fetch Cal.com bookings:', message);
    return { ranSync: false, synced: 0, canceled: 0, error: message };
  }

  const festiveBookings = bookings.filter((b) => FESTIVE_PREFIX.test(attendeeName(b)));
  const now = new Date();
  let synced = 0;

  for (const booking of festiveBookings) {
    if (booking.status === 'cancelled') continue; // handled in the cancellation pass below

    const name = attendeeName(booking).replace(FESTIVE_PREFIX, '').trim();
    const slug = slugify(name);
    if (!slug) continue;

    const start = startOfDay(new Date(booking.start));
    const bookingEnd = startOfDay(new Date(booking.end));
    // Multi-day bookings (e.g. CNY spanning 2 days): end is the last real day.
    // Single-day bookings: Cal.com's end usually equals start (or same calendar day).
    const end = bookingEnd.getTime() > start.getTime() ? bookingEnd : null;

    await prisma.festiveEvent.upsert({
      where: { externalId: booking.uid },
      update: { name, slug, date: start, endDate: end, source: 'cal_com', syncedAt: now },
      create: { externalId: booking.uid, name, slug, date: start, endDate: end, source: 'cal_com', syncedAt: now, sendOnDay: true },
    });
    synced++;

    // Mirror onto the Calendars grid (app/calendars) as a plain "celebration" —
    // same tag/color/detail-modal as any other Celebration event (birthdays, Mid-Year
    // Dinner, etc). No festive-specific field is set, so there's nothing for the grid
    // or its detail modal to visually distinguish it by.
    await prisma.calendarEvent.upsert({
      where: { externalId: booking.uid },
      update: { type: 'celebration', title: name, date: start },
      create: { externalId: booking.uid, type: 'celebration', title: name, date: start },
    });
    if (end) {
      await prisma.calendarEvent.upsert({
        where: { externalId: `${booking.uid}:end` },
        update: { type: 'celebration', title: name, date: end },
        create: { externalId: `${booking.uid}:end`, type: 'celebration', title: name, date: end },
      });
    } else {
      await prisma.calendarEvent.deleteMany({ where: { externalId: `${booking.uid}:end` } });
    }
  }

  // Cancel: any previously-synced row whose Cal.com booking is cancelled or gone AND
  // hasn't fired yet (date/endDate still in the future). A past festival that's since
  // been cancelled is left alone as historical record.
  const activeBookingUids = new Set(festiveBookings.filter((b) => b.status !== 'cancelled').map((b) => b.uid));
  const stillPending = await prisma.festiveEvent.findMany({
    where: { source: 'cal_com', externalId: { not: null } },
  });

  let canceled = 0;
  for (const row of stillPending) {
    const lastRelevantDate = row.endDate ?? row.date;
    const isPending = lastRelevantDate >= today;
    if (isPending && row.externalId && !activeBookingUids.has(row.externalId)) {
      await prisma.festiveEvent.delete({ where: { id: row.id } });
      // Remove the mirrored grid tag(s) too — a canceled festival shouldn't linger on
      // the Calendars page as a "Celebration" event.
      await prisma.calendarEvent.deleteMany({ where: { externalId: { in: [row.externalId, `${row.externalId}:end`] } } });
      await createNotification({
        type: 'festive_canceled',
        title: `🗑️ ${row.name} canceled`,
        message: `Cancelled on Cal.com before its send date (${row.date.toDateString()}) — the pending send was canceled.`,
        metadata: JSON.stringify({ festivalName: row.name, festivalSlug: row.slug, calendarEventId: row.externalId, date: row.date }),
      });
      canceled++;
    }
  }

  return { ranSync: true, synced, canceled };
}
