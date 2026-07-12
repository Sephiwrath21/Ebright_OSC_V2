import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 1x1 transparent GIF, served regardless of whether the log/update succeeds —
// a broken pixel must never surface as a visible error in the recipient's inbox.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7', 'base64');

export async function GET(_req: NextRequest, { params }: { params: { sendLogId: string } }) {
  try {
    const log = await prisma.sendLog.findUnique({ where: { id: params.sendLogId } });
    if (log && !log.openedAt) {
      await prisma.sendLog.update({
        where: { id: params.sendLogId },
        data: {
          openedAt: new Date(),
          status: log.status === 'CLICKED' ? log.status : 'OPENED',
        },
      });
    }
  } catch {
    // ignore — never fail the pixel response
  }

  return new NextResponse(PIXEL, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
  });
}
