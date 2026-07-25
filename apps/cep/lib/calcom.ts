/**
 * Thin client for Cal.com's v2 API — used purely as a calendar of dates here,
 * not for any real booking/slot-picking flow. One Booking = one occasion
 * (festival or showcase); the booking's start time is the send date.
 *
 * Read-only: this app only ever lists bookings, never creates/modifies them.
 *
 * VERIFIED against a live Cal.com account on 2026-07-08 (2 real test bookings,
 * create + cancel round-trip). Two things the initial implementation got wrong,
 * fixed here:
 *
 *  1. `title` is NOT settable at booking creation — Cal.com's v2 API rejects a
 *     `title` field outright ("title property is wrong, property title should
 *     not exist"). The title is always auto-composed as
 *     "{eventType} between {organizer} and {attendee.name}". The one field we
 *     DO fully control is `attendee.name` — so the "Festive: <name>" /
 *     "Showcase: <name>" convention must be read from `attendees[0].name`,
 *     not `title`. (lib/festiveSync.ts / lib/showcaseSync.ts were updated to
 *     match — this file just needs to expose `attendees` on the type.)
 *  2. Pagination is page-number based (`pagination.hasNextPage` /
 *     `pagination.currentPage`), NOT cursor-based. The original code checked
 *     a `nextCursor` field that doesn't exist in the real response, so it
 *     would have silently stopped after page 1 for any account with more than
 *     `take` bookings in the window.
 *
 * `status: 'cancelled'` was confirmed correct — cancelled bookings still
 * appear in the list response (not silently omitted), which is what the
 * sync's cancellation-detection logic relies on.
 */

const CALCOM_API_VERSION = '2024-08-13';

export interface CalcomBooking {
  id: number;
  uid: string;
  title: string;
  status: string; // 'accepted' | 'cancelled' | 'pending' | 'rejected' (confirmed: 'accepted'/'cancelled' seen live)
  start: string; // ISO
  end: string; // ISO
  attendees: Array<{ name: string }>;
}

export function isCalcomConfigured(): boolean {
  return Boolean(process.env.CALCOM_API_KEY && process.env.CALCOM_API_URL);
}

/**
 * List bookings starting within [afterStart, beforeEnd). Cancelled bookings ARE
 * included (status: 'cancelled') so callers can detect cancellations explicitly,
 * rather than inferring deletion from absence like a plain calendar feed would.
 */
export async function fetchCalcomBookings(afterStart: Date, beforeEnd: Date): Promise<CalcomBooking[]> {
  if (!isCalcomConfigured()) {
    throw new Error('Cal.com is not configured (CALCOM_API_KEY / CALCOM_API_URL missing)');
  }

  const baseUrl = process.env.CALCOM_API_URL!.replace(/\/$/, '');
  const bookings: CalcomBooking[] = [];
  let page = 1;

  for (;;) {
    const url = new URL(`${baseUrl}/bookings`);
    url.searchParams.set('afterStart', afterStart.toISOString());
    url.searchParams.set('beforeEnd', beforeEnd.toISOString());
    url.searchParams.set('take', '250');
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
        'cal-api-version': CALCOM_API_VERSION,
      },
    });

    if (!res.ok) {
      // Deliberately don't include headers/request body in the error — the API key
      // lives there and must never end up in logs.
      const body = await res.text().catch(() => '');
      throw new Error(`Cal.com API error ${res.status}: ${body.slice(0, 300)}`);
    }

    const json: { data?: CalcomBooking[]; pagination?: { hasNextPage?: boolean } } = await res.json();
    bookings.push(...(json.data ?? []));
    if (!json.pagination?.hasNextPage) break;
    page++;
  }

  return bookings;
}
