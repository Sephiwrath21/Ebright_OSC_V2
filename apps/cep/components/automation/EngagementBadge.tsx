const STEPS = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] as const;

const STEP_LABELS: Record<string, string> = {
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  OPENED: 'Opened',
  CLICKED: 'Clicked',
};

export function EngagementBadge({ status }: { status: string }) {
  if (status === 'FAILED') {
    return <Pill label="Failed" bg="#fee2e2" fg="#dc2626" />;
  }
  if (status === 'SKIPPED') {
    return <Pill label="Skipped" bg="#f3f4f6" fg="#6b7280" />;
  }
  if (status === 'QUEUED') {
    return <Pill label="Queued" bg="#f3f4f6" fg="#6b7280" />;
  }

  const reachedIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      {STEPS.map((step, i) => {
        const reached = reachedIndex >= 0 && i <= reachedIndex;
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div
              title={STEP_LABELS[step]}
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: reached ? (i === reachedIndex ? '#dc2626' : '#22c55e') : '#e5e7eb',
              }}
            />
            {i < STEPS.length - 1 && (
              <div style={{ width: '10px', height: '1px', background: reached && i < reachedIndex ? '#22c55e' : '#e5e7eb' }} />
            )}
          </div>
        );
      })}
      <span style={{ marginLeft: '4px', fontSize: '10px', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>
        {STEP_LABELS[status] ?? status}
      </span>
    </div>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}
