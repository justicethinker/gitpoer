import React, { useState, useEffect } from 'react';
import { parseUrl, ghFetch } from '../utils/github';
import { callAI } from '../utils/ai';
import { renderMd, dlMd } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import OutputBox from '../components/shared/OutputBox';
import UrlInput from '../components/shared/UrlInput';
import SectionCard from '../components/shared/SectionCard';

const ACCENT = '#8B5CF6';

const FORMATS = [
  { id: 'keepachangelog', label: 'Keep a Changelog', emoji: 'ðŸ“‹', filename: 'CHANGELOG.md' },
  { id: 'github_release', label: 'GitHub Release', emoji: 'ðŸš€', filename: 'RELEASE.md' },
  { id: 'technical', label: 'Technical Summary', emoji: 'âš™ï¸', filename: 'CHANGES-technical.md' },
  { id: 'user_facing', label: 'User-Facing', emoji: 'ðŸ‘¤', filename: 'WHATS-NEW.md' },
  { id: 'pr_desc', label: 'PR Description', emoji: 'ðŸ”€', filename: 'PR-DESCRIPTION.md' },
];

export default function ChangelogGenerator() {
  const { owner, repo } = useParams();

  const { incrementGeneration, isAtLimit, openUpgradeModal } = useApp();
  const [url, setUrl] = useState(`https://github.com/${owner}/${repo}`);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [repoData, setRepoData] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('select'); // 'select' | 'manual'
  const [fromRef, setFromRef] = useState('');
  const [toRef, setToRef] = useState('HEAD');
  const [tags, setTags] = useState([]);
  const [branches, setBranches] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  const [outputs, setOutputs] = useState({});
  const [activeFormat, setActiveFormat] = useState('keepachangelog');
  const [diffStats, setDiffStats] = useState(null);

  const loadRepo = async () => {
    const parsed = parseUrl(url);
    if (!parsed) { setError('Enter a valid GitHub repo URL'); return; }
    setError(''); setLoadingRepo(true); setRepoData(null); setOutputs({});
    try {
      const [meta, tagsData, branchData] = await Promise.all([
        ghFetch(`/repos/${parsed.owner}/${parsed.repo}`),
        ghFetch(`/repos/${parsed.owner}/${parsed.repo}/tags?per_page=30`),
        ghFetch(`/repos/${parsed.owner}/${parsed.repo}/branches?per_page=30`),
      ]);
      if (!meta) throw new Error('Repository not found');
      const sortedTags = (tagsData || []).map(t => t.name);
      const branchNames = (branchData || []).map(b => b.name);
      setTags(sortedTags);
      setBranches(branchNames);
      setRepoData({ ...parsed, meta, defaultBranch: meta.default_branch });
      if (sortedTags.length >= 2) { setFromRef(sortedTags[1]); setToRef(sortedTags[0]); }
      else if (sortedTags.length === 1) { setFromRef(sortedTags[0]); setToRef(meta.default_branch); }
      else { setFromRef(meta.default_branch); setToRef('HEAD'); }
    } catch (e) { setError(e.message); }
    finally { setLoadingRepo(false); }
  };

  const generate = async () => {
    if (!repoData) return;
    if (isAtLimit) { openUpgradeModal('Changelog Generator', 'Generate changelogs in 5 formats'); return; }
    if (!fromRef || !toRef) { setError('Select both refs'); return; }
    setGenerating(true); setError(''); setOutputs({}); setDiffStats(null);
    const msgs = ['Fetching commits...', 'Comparing refs...', 'Analysing changes...', 'Generating changelog...'];
    let mi = 0; setGenMsg(msgs[0]);
    const interval = setInterval(() => { mi = Math.min(mi + 1, msgs.length - 1); setGenMsg(msgs[mi]); }, 900);
    try {
      const { owner, repo } = repoData;
      const compareRes = await ghFetch(`/repos/${owner}/${repo}/compare/${fromRef}...${toRef}`);
      if (!compareRes) throw new Error('Could not compare refs. Ensure both refs exist.');
      const commits = (compareRes.commits || []).filter(c => {
        const msg = c.commit.message.toLowerCase();
        return !msg.startsWith('merge ') && msg !== 'wip' && !msg.startsWith('fix lint') && !msg.startsWith('fixup');
      });
      const files = compareRes.files || [];
      setDiffStats({ additions: compareRes.ahead_by, deletions: compareRes.behind_by, files: files.length, commits: commits.length, totalAdd: files.reduce((s, f) => s + f.additions, 0), totalDel: files.reduce((s, f) => s + f.deletions, 0) });

      const commitList = commits.slice(0, 50).map(c => `- ${c.commit.message.split('\n')[0]} (${c.sha.slice(0, 7)})`).join('\n');
      const fileList = files.slice(0, 30).map(f => `${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
      const contributors = [...new Set(commits.map(c => c.commit.author?.name).filter(Boolean))];

      const systemPrompt = `You are an expert technical writer specializing in changelogs and release notes. 
Generate clear, professional, and specific entries based on actual commits.
Rules: Group related commits, infer intent, ignore merge/WIP/lint commits, use specific names not generic terms.`;

      const baseContext = `Repository: ${owner}/${repo}
Comparing: ${fromRef} â†’ ${toRef}
Commits (${commits.length} total, filtered noise):
${commitList}

Changed files:
${fileList}

Contributors: ${contributors.join(', ')}`;

      const formatPrompts = {
        keepachangelog: `${baseContext}\n\nGenerate a Keep a Changelog format entry. Use sections: ### Added, ### Changed, ### Fixed, ### Removed, ### Security. Start with ## [Unreleased] or ## [version] - date.`,
        github_release: `${baseContext}\n\nGenerate GitHub Release Notes. Sections: ## What's New âœ¨, ## Bug Fixes ðŸ›, ## Breaking Changes âš ï¸ (if any), ## Contributors. Be concise and user-friendly.`,
        technical: `${baseContext}\n\nGenerate a Technical Summary for engineers. Include: API changes, breaking changes, architecture changes, performance impacts, dependency updates. Be precise and technical.`,
        user_facing: `${baseContext}\n\nGenerate user-facing release notes. Zero jargon. Benefit-first language. Use emoji categories. Focus on what users can now DO, not what was changed technically.`,
        pr_desc: `${baseContext}\n\nGenerate a PR description. Include: ## Summary, ## Changes Made (bullet list), ## Type of Change (checkboxes: [ ] Bug fix, [ ] New feature, [ ] Breaking change, [ ] Documentation), ## How to Test, ## Notes for Reviewer.`,
      };

      const results = {};
      for (const [fmtId, prompt] of Object.entries(formatPrompts)) {
        try {
          results[fmtId] = await callAI([{ role: 'user', content: prompt }], systemPrompt, 1500);
        } catch { results[fmtId] = `Failed to generate ${fmtId} format.`; }
      }
      setOutputs(results);
      incrementGeneration();
    } catch (e) { setError(e.message); }
    finally { clearInterval(interval); setGenerating(false); }
  };
return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>ðŸ“</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-.02em' }}>Changelog Generator</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Compare any two refs and generate changelogs in 5 professional formats</p>
          </div>
        </div>
        
        {error && <div style={{ marginTop: 10, padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      </div>

      {repoData && (
        <div className="fade-up">
          {/* Repo + ref selector */}
          <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{repoData.owner}/{repoData.repo}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1e293b', color: '#94a3b8' }}>{repoData.meta?.language}</span>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[['select', 'Select Refs'], ['manual', 'Manual Input']].map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: mode === m ? ACCENT : 'transparent', color: mode === m ? '#fff' : '#475569', border: `1px solid ${mode === m ? ACCENT : '#1e293b'}`, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 6 }}>FROM (base)</label>
                {mode === 'select' ? (
                  <select value={fromRef} onChange={e => setFromRef(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6 }}>
                    <option value="" disabled>Select ref...</option>
                    {tags.length > 0 && <optgroup label="Tags / Releases">{tags.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>}
                    <optgroup label="Branches">{branches.map(b => <option key={b} value={b}>{b}</option>)}</optgroup>
                  </select>
                ) : (
                  <input value={fromRef} onChange={e => setFromRef(e.target.value)} placeholder="SHA, tag, or branch" style={{ width: '100%', padding: '8px 12px', borderRadius: 6 }} />
                )}
              </div>
              <div style={{ fontSize: 18, color: '#475569', paddingBottom: 8 }}>â†’</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 6 }}>TO (head)</label>
                {mode === 'select' ? (
                  <select value={toRef} onChange={e => setToRef(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6 }}>
                    <option value="" disabled>Select ref...</option>
                    {tags.length > 0 && <optgroup label="Tags / Releases">{tags.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>}
                    <optgroup label="Branches">{branches.map(b => <option key={b} value={b}>{b}</option>)}</optgroup>
                    <option value="HEAD">HEAD (latest)</option>
                  </select>
                ) : (
                  <input value={toRef} onChange={e => setToRef(e.target.value)} placeholder="SHA, tag, or branch" style={{ width: '100%', padding: '8px 12px', borderRadius: 6 }} />
                )}
              </div>
              <button onClick={generate} disabled={generating || !fromRef || !toRef} className="btn btn-primary" style={{ background: ACCENT, paddingTop: 9, paddingBottom: 9 }}>
                {generating ? genMsg : 'âœ¨ Generate Changelog'}
              </button>
            </div>
          </div>

          {/* Diff stats */}
          {diffStats && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Commits', value: diffStats.commits, color: ACCENT },
                { label: 'Files Changed', value: diffStats.files, color: '#94a3b8' },
                { label: 'Lines Added', value: `+${diffStats.totalAdd}`, color: '#22c55e' },
                { label: 'Lines Removed', value: `-${diffStats.totalDel}`, color: '#ef4444' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, minWidth: 120, background: '#020617', border: '1px solid #1e293b', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono',monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Format tabs + outputs */}
          {Object.keys(outputs).length > 0 && (
            <div>
              <div className="tab-bar">
                {FORMATS.map(f => (
                  <button key={f.id} className={`tab-btn${activeFormat === f.id ? ' active' : ''}`} style={{ '--accent': ACCENT }} onClick={() => setActiveFormat(f.id)}>
                    {f.emoji} {f.label}
                  </button>
                ))}
              </div>
              {FORMATS.map(f => activeFormat === f.id && outputs[f.id] && (
                <div key={f.id} className="fade-in">
                  <OutputBox content={outputs[f.id]} filename={`CHANGELOG-${fromRef}-to-${toRef}-${f.filename}`} accentColor={ACCENT} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
