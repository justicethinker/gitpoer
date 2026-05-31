import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { parseUrl, ghFetch } from '../utils/github';

function RepoCard({ repo }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  // Mock score based on stars for demo purposes
  const scoreNum = Math.min(100, Math.floor(65 + (repo.stars || 0) / 100));
  let letter = 'C';
  let color = '#f59e0b'; // orange
  if (scoreNum >= 90) { letter = 'A'; color = '#3b82f6'; } // green
  else if (scoreNum >= 80) { letter = 'B'; color = '#3b82f6'; } // blue
  else if (scoreNum < 70) { letter = 'D'; color = '#ef4444'; } // red

  return (
    <div
      onClick={() => navigate(`/app/repo/${repo.owner}/${repo.repo}`)}
      style={{
        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 20,
        cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative',
        display: 'flex', flexDirection: 'column', minHeight: 140,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = `0 10px 20px -10px ${color}30`;
        setHovered(true);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#1e293b';
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
        setHovered(false);
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: hovered ? `${color}15` : '#3b82f615',
          border: `1px solid ${hovered ? color : '#3b82f6'}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
          transition: 'all 0.3s',
        }}>
          ðŸ“¦
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f6fc', lineHeight: 1.2 }}>{repo.repo}</div>
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{repo.owner}</div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Description */}
        <p style={{
          fontSize: 13, color: '#8b949e', margin: 0,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          transition: 'all 0.3s',
        }}>
          {repo.description || 'No description provided.'}
        </p>

        {/* Hover State: Details / Score */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          height: hovered ? 40 : 0,
          opacity: hovered ? 1 : 0,
          overflow: 'hidden',
          marginTop: hovered ? 8 : 0,
          transition: 'all 0.3s',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Score</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color }}>{letter}</span>
              <span style={{ fontSize: 13, color: '#f0f6fc', fontWeight: 600 }}>{scoreNum}/100</span>
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: '#1e293b' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Updated</span>
            <span style={{ fontSize: 13, color: '#f0f6fc', fontWeight: 600 }}>
              {repo.updatedAt ? new Date(repo.updatedAt).toLocaleDateString() : 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#6e7681',
        marginTop: 'auto', paddingTop: 16
      }}>
        {repo.language && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: hovered ? color : '#3b82f6', transition: 'background 0.3s' }} />
            {repo.language}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          â­ {repo.stars}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, cachedRepos, addCachedRepo, plan, generationsLeft } = useApp();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    const parsed = parseUrl(url);
    if (!parsed) {
      setError('Invalid GitHub repository URL');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const meta = await ghFetch(`/repos/${parsed.owner}/${parsed.repo}`);
      if (!meta) throw new Error('Repository not found or private');
      addCachedRepo({
        id: meta.id,
        owner: parsed.owner,
        repo: parsed.repo,
        description: meta.description,
        stars: meta.stargazers_count,
        language: meta.language,
        updatedAt: meta.updated_at,
        defaultBranch: meta.default_branch
      });
      setUrl('');
      navigate(`/app/repo/${parsed.owner}/${parsed.repo}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px' }}>
      
      {/* Top Stats Bar */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 40, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>Active Plan</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#f0f6fc' }}>{plan.name}</span>
            <button onClick={() => navigate('/pricing')} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4 }}>Upgrade</button>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>Generations Left</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f0f6fc' }}>
            {generationsLeft === Infinity ? 'Unlimited' : generationsLeft}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>Connected Repos</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f0f6fc' }}>{cachedRepos.length}</div>
        </div>
      </div>

      {/* Import Form */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24, marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>Import Repository</h2>
        <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 16 }}>Paste a public GitHub repository URL to add it to your dashboard.</p>
        <form onSubmit={handleImport} style={{ display: 'flex', gap: 10 }}>
          <input 
            type="text" 
            value={url} 
            onChange={e => setUrl(e.target.value)} 
            placeholder="https://github.com/owner/repo"
            style={{ flex: 1, padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button type="submit" disabled={loading || !url} className="btn btn-primary" style={{ padding: '0 24px' }}>
            {loading ? 'Importing...' : 'Import'}
          </button>
        </form>
        {error && <div style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>{error}</div>}
      </div>

      {/* Repo List */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f0f6fc', marginBottom: 16 }}>Your Repositories</h2>
      {cachedRepos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed #1e293b', borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>ðŸ“</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f6fc', marginBottom: 4 }}>No repositories yet</div>
          <div style={{ fontSize: 13, color: '#8b949e' }}>Import a repository above to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {cachedRepos.map(repo => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}

    </div>
  );
}
