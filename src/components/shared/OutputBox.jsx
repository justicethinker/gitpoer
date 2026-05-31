import { useState } from 'react';
import { copyToClipboard, dlMd, renderMd } from '../../utils/markdown';

export default function OutputBox({ content, filename, accentColor }) {
  const [mode, setMode] = useState('preview');
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    dlMd(content, filename);
  }

  return (
    <div
      style={{
        background: '#020617',
        border: '1px solid #1e293b',
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #1e293b',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: filename badge */}
        <span
          style={{
            background: 'rgba(34,197,94,0.12)',
            color: '#22c55e',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 6,
            padding: '3px 10px',
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {filename}
        </span>

        {/* Right: toggle + copy + download */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Preview / Raw pill toggle */}
          <div
            style={{
              display: 'flex',
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 20,
              overflow: 'hidden',
            }}
          >
            {['preview', 'raw'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 14px',
                  fontSize: 12,
                  fontFamily: 'DM Sans, sans-serif',
                  fontWeight: 600,
                  color: mode === m ? accentColor : '#475569',
                  borderBottom: mode === m ? `2px solid ${accentColor}` : '2px solid transparent',
                  transition: 'color 0.15s, border-color 0.15s',
                  outline: 'none',
                }}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 7,
              color: copied ? '#22c55e' : '#94a3b8',
              fontSize: 12,
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 600,
              padding: '5px 13px',
              cursor: 'pointer',
              transition: 'color 0.15s',
              outline: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? 'Copied âœ“' : 'Copy'}
          </button>

          {/* Download button */}
          <button
            onClick={handleDownload}
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 7,
              color: '#94a3b8',
              fontSize: 12,
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 600,
              padding: '5px 13px',
              cursor: 'pointer',
              outline: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            â†“ .md
          </button>
        </div>
      </div>

      {/* Content area */}
      {mode === 'preview' ? (
        <div
          className="md-output"
          style={{
            maxHeight: 500,
            overflowY: 'auto',
            padding: '16px 20px',
          }}
          dangerouslySetInnerHTML={{ __html: renderMd(content) }}
        />
      ) : (
        <pre
          style={{
            maxHeight: 500,
            overflowY: 'auto',
            margin: 0,
            padding: '16px 20px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            color: '#94a3b8',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.6,
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
