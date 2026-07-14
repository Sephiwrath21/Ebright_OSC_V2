import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const now = new Date();
    const job = await prisma.autoBlastJob.findUnique({ where: { id: params.id } });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    await prisma.autoBlastJob.update({
      where: { id: params.id },
      data: {
        isActive: true,
        nextRunAt: new Date(now.getTime() + job.intervalMinutes * 60_000),
      },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
