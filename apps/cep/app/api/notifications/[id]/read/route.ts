import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.ebrightCepNotification.update({ where: { id: params.id }, data: { read: true } });
  return NextResponse.json({ success: true });
}
