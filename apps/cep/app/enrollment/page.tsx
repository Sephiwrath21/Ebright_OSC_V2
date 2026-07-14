import { prisma } from '@/lib/prisma';
import { FilterBar } from '@/components/shared/FilterBar';
import { PLAN_TYPES, PLAN_TYPE_LABELS } from '@/lib/planTypes';
import { numberedBranchLabel } from '@/lib/branches';

export const dynamic = 'force-dynamic';

export default async function EnrollmentPage({
  searchParams,
}: {
  searchParams: { branch?: string; program?: string; plan_type?: string };
}) {
  const branch = searchParams.branch;
  const program = searchParams.program;
  const planType = searchParams.plan_type;

  const [parents, branches, programs] = await Promise.all([
    prisma.parent.findMany({
      where: {
        ...(branch ? { branch: { name: branch } } : {}),
        ...(program ? { program } : {}),
        ...(planType ? { plan_type: planType } : {}),
      },
      select: { enrollDate: true, branch: { select: { name: true } }, program: true, status: true, plan_type: true },
    }),
    prisma.ebrightCepBranch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.parent.findMany({ distinct: ['program'], select: { program: true } }),
  ]);

  const byMonth: Record<string, number> = {};
  const byBranch: Record<string, number> = {};
  const byProgram: Record<string, number> = {};
  const byPlan: Record<string, number> = {};

  for (const p of parents) {
    const key = `${p.enrollDate.getFullYear()}-${String(p.enrollDate.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] ?? 0) + 1;
    byBranch[p.branch.name] = (byBranch[p.branch.name] ?? 0) + 1;
    byProgram[p.program] = (byProgram[p.program] ?? 0) + 1;
    const planKey = p.plan_type ?? 'unset';
    byPlan[planKey] = (byPlan[planKey] ?? 0) + 1;
  }

  const monthEntries = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
  const maxMonth = Math.max(1, ...Object.values(byMonth));

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Enrollment</h1>
      <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 16px' }}>{parents.length} total parents across all cohorts</p>

      <FilterBar
        current={{ branch: branch ?? 'all', program: program ?? 'all', plan_type: planType ?? 'all' }}
        filters={[
          { key: 'branch', label: 'Branches', options: branches.map((b, i) => ({ value: b.name, label: numberedBranchLabel(i, b.name) })) },
          { key: 'program', label: 'Programs', options: programs.map((p) => ({ value: p.program, label: p.program })) },
          { key: 'plan_type', label: 'Plans', options: PLAN_TYPES.map((p) => ({ value: p, label: PLAN_TYPE_LABELS[p] })) },
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <Card title="Monthly enrollments">
          <div style={{ display: 'flex', alignItems: 'end', gap: '8px', height: '220px', padding: '10px 0' }}>
            {monthEntries.map(([k, v]) => (
              <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>{v}</div>
                <div
                  style={{
                    width: '100%',
                    height: `${(v / maxMonth) * 180}px`,
                    background: 'linear-gradient(180deg, #dc2626, #991b1b)',
                    borderRadius: '4px 4px 0 0',
                    minHeight: '4px',
                  }}
                />
                <div style={{ fontSize: '10px', color: '#9ca3af' }}>{k.slice(5)}/{k.slice(2, 4)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="By branch">
          {Object.entries(byBranch)
            .sort(([, a], [, b]) => b - a)
            .map(([b, n]) => (
              <Row key={b} label={b} value={n} />
            ))}
        </Card>
      </div>

      <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <Card title="By program">
          {Object.entries(byProgram)
            .sort(([, a], [, b]) => b - a)
            .map(([b, n]) => (
              <Row key={b} label={b} value={n} />
            ))}
        </Card>

        <Card title="By plan">
          {Object.entries(byPlan)
            .sort(([, a], [, b]) => b - a)
            .map(([p, n]) => (
              <Row key={p} label={p === 'unset' ? 'Not set' : PLAN_TYPE_LABELS[p] ?? p} value={n} />
            ))}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>
      <span style={{ color: '#374151' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
