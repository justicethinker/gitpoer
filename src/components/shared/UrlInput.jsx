import { useState } from 'react';

const EXAMPLE_REPOS = [
  'https://github.com/facebook/react',
  'https://github.com/tiangolo/fastapi',
  'https://github.com/vercel/next.js',
];

export default function UrlInput({
  value,
  onChange,
  onSubmit,
  loading = false,
  placeholder = 'https://github.com/owner/repo',
  buttonText = 'Scan',
  accentColor = '#6366f1',
  disabled = false,
}) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !loading && !disabled) {
      onSubmit();
    }
  }

  function handleExampleClick(url) {
    onChange(url);
  }

  const isDisabled = loading || disabled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'DM Sans, sans-serif' }}>
      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          style={{
            flex: 1,
            padding: '11px 14px',
            background: '#020617',
            border: '1px solid #1e293b',
            borderRadius: 8,
            color: '#f1f5f9',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            outline: 'none',
            transition: 'border-color 0.15s',
            opacity: isDisabled ? 0.6 : 1,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = accentColor;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#1e293b';
          }}
        />

        <button
          onClick={() => !isDisabled && onSubmit()}
          disabled={isDisabled}
          style={{
            width: 120,
            padding: '11px 0',
            background: isDisabled
              ? '#1e293b'
              : accentColor,
            border: 'none',
            borderRadius: 8,
            color: isDisabled ? '#475569' : '#fff',
            fontFamily: 'DM Sans, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s, color 0.15s',
            outline: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Scanning...' : buttonText}
        </button>
      </div>

      {/* Example repo quick-picks */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11,
            color: '#475569',
            fontFamily: 'DM Sans, sans-serif',
            fontWeight: 500,
          }}
        >
          Try:
        </span>
        {EXAMPLE_REPOS.map((url) => {
          const label = url.replace('https://github.com/', '');
          return (
            <button
              key={url}
              onClick={() => handleExampleClick(url)}
              disabled={isDisabled}
              style={{
                background: 'none',
                border: '1px solid #1e293b',
                borderRadius: 20,
                color: '#94a3b8',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                padding: '3px 9px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
                outline: 'none',
                opacity: isDisabled ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isDisabled) {
                  e.currentTarget.style.borderColor = accentColor;
                  e.currentTarget.style.color = '#f1f5f9';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1e293b';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
