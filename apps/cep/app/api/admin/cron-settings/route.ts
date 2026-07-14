import { NextRequest, NextResponse } from 'next/server';
import { getCronEnabled, setCronEnabled, getNextTickAt } from '@/lib/cronSettings';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ enabled: await getCronEnabled(), nextTickAt: getNextTickAt().toISOString() });
}

/** The real Start/Stop kill switch for the day-based automation scheduler. Logged for audit. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const enabled = await setCronEnabled(Boolean(body.enabled));

  await createNotification({
    type: 'system',
    title: `Auto-blast ${enabled ? 'started' : 'stopped'}`,
    message: `Day-based automation (follow-up, review, referral, renewal, birthday, festive, video) was turned ${enabled ? 'ON' : 'OFF'} by admin.`,
  });

  return NextResponse.json({ enabled, nextTickAt: getNextTickAt().toISOString() });
}
