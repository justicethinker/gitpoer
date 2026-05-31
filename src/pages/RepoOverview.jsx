import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ghFetch } from '../utils/github';
import { useApp } from '../context/AppContext';

const TOOLS = [
  { path: 'score', emoji: 'ðŸ“Š', name: 'Portfolio Score', desc: 'Grade your repo across 5 dimensions.' },
  { path: 'score', emoji: '📊', name: 'Portfolio Score', desc: 'Grade your repo across 5 dimensions.' },
  { path: 'readme', emoji: '📄', name: 'README Generator', desc: 'Auto-generate beautiful READMEs.' },
  { path: 'changelog', emoji: '📝', name: 'Changelog', desc: 'Turn commits into release notes.' },
  { path: 'onboarding', emoji: '🤝', name: 'Onboarding Doc', desc: 'Generate contributing wikis.' },
  { path: 'pr', emoji: '🔀', name: 'PR Autopilot', desc: 'AI writes PR descriptions for you.' },
  { path: 'audit', emoji: '🔍', name: 'Repo Audit', desc: 'Identify junk files and security flags.' },
  { path: 'install', emoji: '⚡', name: 'Quick Install', desc: 'Generate one-liner install scripts.' },
  { path: 'translate', emoji: '🌐', name: 'Multi-Language', desc: 'Translate docs into 20 languages.' },
  { path: 'validator', emoji: '✅', name: 'Doc Validator', desc: 'Check docs for accuracy & typos.' },
  { path: 'issues', emoji: '🎫️', name: 'Issue Templates', desc: 'Generate standard GitHub issue templates.' },
];

export default function RepoOverview() {
  const { owner, repo } = useParams();
  const navigate = useNavigate();
  const [repoData, setRepoData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    ghFetch(`/repos/${owner}/${repo}`)
      .then(meta => setRepoData(meta))
      .catch(err => setError(err.message));
  }, [owner, repo]);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>âš ï¸</div>
        <h2 style={{ color: '#f0f6fc', marginBottom: 8 }}>Repository Not Found</h2>
        <p style={{ color: '#8b949e', marginBottom: 24 }}>{error}</p>
        <Link to="/app" style={{ color: '#3b82f6', textDecoration: 'none' }}>â† Back to Dashboard</Link>
      </div>
    );
  }

  if (!repoData) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>Loading repository data...</div>;
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
      
      {/* Breadcrumbs */}
      <div style={{ fontSize: 13, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link to="/app" style={{ color: '#8b949e', textDecoration: 'none' }}>Dashboard</Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <span style={{ color: '#f0f6fc', fontWeight: 600 }}>{repo}</span>
      </div>

      {/* Repo Header */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 32, marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: '#3b82f620', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
            ðŸ“¦
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f0f6fc', margin: 0, lineHeight: 1.1 }}>{repoData.name}</h1>
            <div style={{ fontSize: 14, color: '#8b949e', marginTop: 4 }}>by {repoData.owner.login}</div>
          </div>
        </div>
        <p style={{ fontSize: 14, color: '#f0f6fc', maxWidth: 600, margin: '0 0 20px' }}>
          {repoData.description || 'No description provided.'}
        </p>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#8b949e' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>â­ {repoData.stargazers_count} stars</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>ðŸ´ {repoData.forks_count} forks</span>
          {repoData.language && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }}/> {repoData.language}</span>}
        </div>
      </div>

      {/* Tools Grid */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f0f6fc' }}>Available Tools</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {TOOLS.map(tool => (
          <div 
            key={tool.path}
            onClick={() => navigate(`/app/repo/${owner}/${repo}/${tool.path}`)}
            style={{
              background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '20px 24px',
              cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', gap: 8
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#21262d'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.background = '#0f172a'; }}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>{tool.emoji}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f6fc' }}>{tool.name}</div>
            <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5 }}>{tool.desc}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
