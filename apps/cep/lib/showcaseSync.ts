/**
 * Syncs ShowcaseEvent rows from Cal.com (lib/calcom.ts) — mirrors lib/festiveSync.ts's
 * pattern exactly, but for one-off showcase events instead of recurring festivals.
 * One Booking = one showcase: its ATTENDEE NAME (not title — see lib/calcom.ts for
 * why) must start with "Showcase: " (e.g. "Showcase: Puchong Branch Q3") to be picked up.
 *
 * Upserts are keyed by the booking's uid (ShowcaseEvent.externalId). If a booking is
 * cancelled before its date, the matching ShowcaseEvent row (and its Calendars-grid
 * mirror) is deleted — this cancels the pending send outright, same as festivals.
 */
import { addDays, startOfDay } from 'date-fns';
import { prisma } from './prisma';
import { createNotification } from './notifications';
import { slugify } from './slug';
import { fetchCalcomBookings, isCalcomConfigured, type CalcomBooking } from './calcom';

const SHOWCASE_PREFIX = /^showcase:\s*/i;

function attendeeName(b: CalcomBooking): string {
  return b.attendees[0]?.name ?? '';
}

export interface ShowcaseSyncResult {
  ranSync: boolean;
  synced: number;
  canceled: number;
  error?: string;
}

export async function syncShowcaseEvents(): Promise<ShowcaseSyncResult> {
  if (!isCalcomConfigured()) {
    return { ranSync: false, synced: 0, canceled: 0 };
  }

  const today = startOfDay(new Date());
  const timeMin = addDays(today, -1);
  const timeMax = addDays(today, 400);

  let bookings: CalcomBooking[];
  try {
    bookings = await fetchCalcomBookings(timeMin, timeMax);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[showcaseSync] failed to fetch Cal.com bookings:', message);
    return { ranSync: false, synced: 0, canceled: 0, error: message };
  }

  const showcaseBookings = bookings.filter((b) => SHOWCASE_PREFIX.test(attendeeName(b)));
  const now = new Date();
  let synced = 0;

  for (const booking of showcaseBookings) {
    if (booking.status === 'cancelled') continue; // handled in the cancellation pass below

    const name = attendeeName(booking).replace(SHOWCASE_PREFIX, '').trim();
    const slug = slugify(name);
    if (!slug) continue;

    const start = startOfDay(new Date(booking.start));

    await prisma.showcaseEvent.upsert({
      where: { externalId: booking.uid },
      update: { name, slug, date: start, source: 'cal_com', syncedAt: now },
      create: { externalId: booking.uid, name, slug, date: start, source: 'cal_com', syncedAt: now },
    });
    synced++;

    // Mirror onto the Calendars grid as a plain "showcase" event — same tag/color/
    // detail-modal as any other Showcase entry, no visual distinction.
    await prisma.calendarEvent.upsert({
      where: { externalId: booking.uid },
      update: { type: 'showcase', title: name, date: start },
      create: { externalId: booking.uid, type: 'showcase', title: name, date: start },
    });
  }

  const activeBookingUids = new Set(showcaseBookings.filter((b) => b.status !== 'cancelled').map((b) => b.uid));
  const stillPending = await prisma.showcaseEvent.findMany({
    where: { source: 'cal_com', externalId: { not: null } },
  });

  let canceled = 0;
  for (const row of stillPending) {
    const isPending = row.date >= today;
    if (isPending && row.externalId && !activeBookingUids.has(row.externalId)) {
      await prisma.showcaseEvent.delete({ where: { id: row.id } });
      await prisma.calendarEvent.deleteMany({ where: { externalId: row.externalId } });
      await createNotification({
        type: 'showcase_canceled',
        title: `🗑️ Showcase "${row.name}" canceled`,
        message: `Cancelled on Cal.com before its date (${row.date.toDateString()}) — the pending send was canceled.`,
        metadata: JSON.stringify({ showcaseName: row.name, showcaseSlug: row.slug, calendarEventId: row.externalId, date: row.date }),
      });
      canceled++;
    }
  }

  return { ranSync: true, synced, canceled };
}
