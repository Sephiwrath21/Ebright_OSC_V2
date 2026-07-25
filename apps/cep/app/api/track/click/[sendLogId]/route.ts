import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { sendLogId: string } }) {
  const url = new URL(req.url);
  const rawTarget = url.searchParams.get('url') || '/';
  const target = rawTarget.startsWith('/') || /^https?:\/\//.test(rawTarget) ? rawTarget : `https://${rawTarget}`;

  try {
    const log = await prisma.sendLog.findUnique({ where: { id: params.sendLogId } });
    if (log && !log.clickedAt) {
      await prisma.sendLog.update({
        where: { id: params.sendLogId },
        data: { clickedAt: new Date(), status: 'CLICKED' },
      });
    }
  } catch {
    // ignore — still redirect the recipient even if logging fails
  }

  return NextResponse.redirect(target);
}
