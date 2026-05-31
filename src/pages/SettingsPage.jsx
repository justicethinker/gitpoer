import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const { state } = useApp();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState(state.apiKey || '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // In a real app this would save via context to localStorage
    localStorage.setItem('gg_api_key', apiKey);
    window.dispatchEvent(new Event('storage'));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => navigate('/app')} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', marginBottom: 20, fontWeight: 700 }}>
        â† Back to Dashboard
      </button>
      
      <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f0f6fc', marginBottom: 8 }}>Settings</h1>
      <p style={{ color: '#8b949e', fontSize: 15, marginBottom: 32 }}>Manage your application preferences and API keys.</p>
      
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f0f6fc', marginBottom: 16 }}>AI Integration</h2>
        <p style={{ color: '#8b949e', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          GitGrade uses Google Gemini. If you don't have a system-wide key configured in your environment (`VITE_GEMINI_API_KEY`), you can enter your personal Gemini API key below to unlock generation features.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Gemini API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
            style={{
              padding: '12px 16px',
              background: '#020617',
              border: '1px solid #1e293b',
              borderRadius: 8,
              color: '#f1f5f9',
              fontFamily: 'monospace',
              fontSize: 14,
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = '#1e293b'}
          />
        </div>
        
        <button
          onClick={handleSave}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 700,
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
          onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
        >
          {saved ? 'Saved âœ“' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
