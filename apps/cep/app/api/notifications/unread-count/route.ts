import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const count = await prisma.ebrightCepNotification.count({ where: { read: false } });
  return NextResponse.json({ count });
}
