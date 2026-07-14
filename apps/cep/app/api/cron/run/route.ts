import { NextResponse } from 'next/server';
import { runCron } from '@/lib/cron';

export const dynamic = 'force-dynamic';

/**
 * This endpoint powers the main day-based automation engine.
 * It iterates through all active parents and all active automation rules,
 * determines which messages are due, and sends them.
 */
export async function POST() {
  const result = await runCron();
  return NextResponse.json(result);
}
