'use client';

interface ParentStatusRow {
  id: string;
  name: string;
  studentName: string;
  branch: string;
  daysSinceEnroll: number;
  plan_type: string;
  followup: 'sent' | 'due' | 'upcoming';
  review: 'sent' | 'due' | 'upcoming';
  referral: 'sent' | 'due' | 'upcoming';
  renewal: 'sent' | 'due' | 'upcoming' | 'disabled';
  video: 'sent' | 'pending';
  birthdayToday: boolean;
  festiveToday: boolean;
}

function StatusBadge({ state }: { state: 'sent' | 'due' | 'upcoming' | 'pending' | 'disabled' }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    sent: { bg: '#f0fdf4', color: '#166534', label: 'Sent' },
    due: { bg: '#fffbeb', color: '#92400e', label: 'Due' },
    upcoming: { bg: '#f9fafb', color: '#9ca3af', label: '—' },
    pending: { bg: '#f9fafb', color: '#9ca3af', label: 'Pending' },
    disabled: { bg: '#f9fafb', color: '#d1d5db', label: 'N/A' },
  };
  const s = styles[state] ?? styles.upcoming;
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: '99px',
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

export function ParentStatusTable({ rows }: { rows: ParentStatusRow[] }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Per-parent status</h3>
      </div>
      {rows.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
          No parents match the current filters.
        </div>
      )}
      <div style={{ overflowX: 'auto', display: rows.length === 0 ? 'none' : 'block' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Parent</th>
              <th style={{ padding: '8px 12px' }}>Plan</th>
              <th style={{ padding: '8px 12px' }}>Days</th>
              <th style={{ padding: '8px 12px' }}>Follow-up</th>
              <th style={{ padding: '8px 12px' }}>Review</th>
              <th style={{ padding: '8px 12px' }}>Referral</th>
              <th style={{ padding: '8px 12px' }}>Renewal</th>
              <th style={{ padding: '8px 12px' }}>Video</th>
              <th style={{ padding: '8px 12px' }}>Birthday</th>
              <th style={{ padding: '8px 12px' }}>Festive</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ fontWeight: 500 }}>{r.name}</div>
                  <div style={{ color: '#9ca3af' }}>{r.studentName} · {r.branch}</div>
                </td>
                <td style={{ padding: '8px 12px' }}>{r.plan_type}</td>
                <td style={{ padding: '8px 12px' }}>{r.daysSinceEnroll}</td>
                <td style={{ padding: '8px 12px' }}><StatusBadge state={r.followup} /></td>
                <td style={{ padding: '8px 12px' }}><StatusBadge state={r.review} /></td>
                <td style={{ padding: '8px 12px' }}><StatusBadge state={r.referral} /></td>
                <td style={{ padding: '8px 12px' }}><StatusBadge state={r.renewal} /></td>
                <td style={{ padding: '8px 12px' }}><StatusBadge state={r.video} /></td>
                <td style={{ padding: '8px 12px' }}>
                  {r.birthdayToday ? <StatusBadge state="due" /> : <StatusBadge state="upcoming" />}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {r.festiveToday ? <StatusBadge state="due" /> : <StatusBadge state="upcoming" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}