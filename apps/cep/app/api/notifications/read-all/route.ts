import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST() {
  await prisma.ebrightCepNotification.updateMany({ where: { read: false }, data: { read: true } });
  return NextResponse.json({ success: true });
}
