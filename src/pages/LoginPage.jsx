import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useApp();
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    // Mocking an OAuth redirect delay
    setTimeout(() => {
      login({
        handle: 'mockuser',
        name: 'Mock User',
        avatar: 'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
        repos: 12
      });
      navigate('/app');
    }, 1500);
  };

  const handleBypass = () => {
    login({
      handle: 'tester',
      name: 'Test Engineer',
      avatar: 'https://avatars.githubusercontent.com/u/1024025?v=4',
      repos: 42
    });
    navigate('/app');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: 32 }}>
        
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 20px',
            background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: 'DM Sans, sans-serif'
          }}>G</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f0f6fc', marginBottom: 8, letterSpacing: '-0.02em' }}>
            Sign in to GitGrade
          </h1>
          <p style={{ color: '#8b949e', fontSize: 14 }}>
            Connect your GitHub account to grade and improve your repositories.
          </p>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
            background: '#f0f6fc', color: '#020617', fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: loading ? 'wait' : 'pointer', transition: 'all 0.2s ease',
            fontFamily: 'DM Sans, sans-serif'
          }}
          onMouseEnter={e => !loading && (e.currentTarget.style.background = '#ffffff')}
          onMouseLeave={e => !loading && (e.currentTarget.style.background = '#f0f6fc')}
        >
          {loading ? (
            <span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>Connecting...</span>
          ) : (
            <>
              <svg height="20" aria-hidden="true" viewBox="0 0 16 16" version="1.1" width="20" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
              </svg>
              Continue with GitHub
            </>
          )}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#1e293b' }} />
          <span style={{ fontSize: 12, color: '#6e7681', fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: '#1e293b' }} />
        </div>

        <button
          onClick={handleBypass}
          style={{
            width: '100%', padding: '10px 20px', borderRadius: 8,
            background: 'transparent', color: '#8b949e', border: '1px solid #1e293b',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease',
            fontFamily: 'DM Sans, sans-serif'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f0f6fc'; e.currentTarget.style.borderColor = '#484f58'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.borderColor = '#1e293b'; }}
        >
          Bypass Login (Testing Only)
        </button>

        <p style={{ fontSize: 12, color: '#6e7681', textAlign: 'center', marginTop: 32, lineHeight: 1.5 }}>
          By clicking continue, you agree to our Terms of Service and Privacy Policy.
        </p>

      </div>
    </div>
  );
}
