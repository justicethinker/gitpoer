const SEVERITY_MAP = {
  critical: { color: '#ef4444', label: 'CRITICAL', className: 'badge-critical' },
  high:     { color: '#f97316', label: 'HIGH',     className: 'badge-high' },
  medium:   { color: '#eab308', label: 'MED',      className: 'badge-medium' },
  low:      { color: '#64748b', label: 'LOW',       className: 'badge-low' },
};

export default function SeverityBadge({ severity }) {
  const key = (severity || '').toLowerCase();
  const config = SEVERITY_MAP[key] || SEVERITY_MAP.low;

  return (
    <span
      className={`severity-badge ${config.className}`}
      style={{
        display: 'inline-block',
        background: config.color + '20',
        color: config.color,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        borderRadius: 5,
        padding: '2px 7px',
        lineHeight: 1.6,
        border: `1px solid ${config.color}33`,
      }}
    >
      {config.label}
    </span>
  );
}
