import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Public, read-only list of showcase events — used by the Content library page to
 * build trigger options. Unlike /api/admin/showcase, this isn't gated by the admin middleware. */
export async function GET() {
  const events = await prisma.showcaseEvent.findMany({ orderBy: { date: 'asc' } });
  return NextResponse.json(events);
}
