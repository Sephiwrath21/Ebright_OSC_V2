/**
 * Manual trigger for the auto-blast checker.
 * Also used as the endpoint an external scheduler (e.g. Vercel Cron)
 * would hit in a serverless deployment — see comment at top of lib/autoblast.ts.
 */
import { NextResponse } from 'next/server';
import { checkAndRunAutoBlasts } from '@/lib/autoblast';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await checkAndRunAutoBlasts();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
