import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function LogoutPage() {
  const navigate = useNavigate();
  const { logout } = useApp();

  useEffect(() => {
    logout();
    const timer = setTimeout(() => {
      navigate('/login');
    }, 800);
    return () => clearTimeout(timer);
  }, [logout, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020817',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'DM Sans, sans-serif',
        color: '#f1f5f9',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: '3px solid #3b82f6',
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px',
          }}
        />
        <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700 }}>Logging out...</h2>
        <p style={{ color: '#94a3b8', margin: 0 }}>Clearing your session data securely.</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
