import { useApp } from '../../context/AppContext';

export default function ProBadge({ feature, description, onClick }) {
  const { openUpgradeModal } = useApp();

  function handleClick() {
    if (onClick) {
      onClick();
    } else {
      openUpgradeModal(feature, description);
    }
  }

  return (
    <span
      onClick={handleClick}
      title={description || `Unlock ${feature}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: '#fff',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        borderRadius: 5,
        padding: '2px 7px',
        cursor: 'pointer',
        userSelect: 'none',
        verticalAlign: 'middle',
        transition: 'transform 0.1s, box-shadow 0.1s',
        boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
        lineHeight: 1.6,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.07)';
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.25)';
      }}
    >
      🔒 PRO
    </span>
  );
}
