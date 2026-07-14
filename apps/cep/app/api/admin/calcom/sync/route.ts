import { NextResponse } from 'next/server';
import { syncFestiveCalendar } from '@/lib/festiveSync';
import { syncShowcaseEvents } from '@/lib/showcaseSync';
import { touchCalcomSyncedAt } from '@/lib/cronSettings';
import { isCalcomConfigured } from '@/lib/calcom';

export const dynamic = 'force-dynamic';

/** Manual "Sync now" trigger for the Rules admin page (festivals + showcases) — the
 * scheduler already does this ~daily on its own; this just lets an admin force it
 * immediately after editing Cal.com or setting up credentials for the first time. */
export async function POST() {

  if (!isCalcomConfigured()) {
    return NextResponse.json(
      { error: 'Cal.com is not configured — set CALCOM_API_KEY and CALCOM_API_URL in .env' },
      { status: 400 },
    );
  }

  const [festive, showcase] = await Promise.all([syncFestiveCalendar(), syncShowcaseEvents()]);
  if (festive.ranSync || showcase.ranSync) await touchCalcomSyncedAt();

  return NextResponse.json({ festive, showcase });
}
