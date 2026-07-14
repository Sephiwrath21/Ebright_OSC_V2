import { prisma } from '@/lib/prisma';
import { BranchesClient } from './BranchesClient';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const branches = await prisma.ebrightCepBranch.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { parents: true } } },
  });

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Branches</h1>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>
          {branches.length} branches · used by Parents, Blast, and Promo segment filters.
        </p>
      </div>
      <BranchesClient
        initialBranches={branches.map((b) => ({
          id: b.id,
          name: b.name,
          isActive: b.isActive,
          parentCount: b._count.parents,
        }))}
      />
    </div>
  );
}
