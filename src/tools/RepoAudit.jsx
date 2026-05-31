import React, { useState, useEffect, useRef } from 'react';
import { parseUrl, ghFetch, fetchRepoContext } from '../utils/github';
import { callAI } from '../utils/ai';
import { renderMd, dlMd } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import OutputBox from '../components/shared/OutputBox';
import UrlInput from '../components/shared/UrlInput';
import SectionCard from '../components/shared/SectionCard';
import SeverityBadge from '../components/shared/SeverityBadge';
import ProBadge from '../components/shared/ProBadge';

const ACCENT = '#C2410C';

// â”€â”€ Detection patterns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COMMITTED_PATTERNS = [
  { id: 'node_modules', severity: 'critical', test: f => f.startsWith('node_modules/') || f === 'node_modules', message: 'node_modules/ is committed', fix: 'git rm -r --cached node_modules\necho "node_modules" >> .gitignore' },
  { id: 'dotenv', severity: 'critical', test: f => f === '.env' || f.endsWith('/.env'), message: '.env file committed â€” may contain secrets', fix: 'git rm --cached .env\necho ".env" >> .gitignore' },
  { id: 'secrets', severity: 'critical', test: f => /\.(key|pem|p12|pfx)$/.test(f) || /secret|credential|password|private[-_]key/i.test(f), message: 'Potential credential/secret file detected', fix: 'git rm --cached <file>\n# Consider rotating any exposed credentials immediately' },
  { id: 'dsstore', severity: 'high', test: f => f.endsWith('.DS_Store'), message: '.DS_Store files committed (macOS metadata)', fix: 'git rm --cached **/.DS_Store\necho ".DS_Store" >> .gitignore' },
  { id: 'logs', severity: 'high', test: f => f.endsWith('.log') && !f.includes('test') && !f.includes('spec'), message: 'Log files committed', fix: 'git rm --cached **/*.log\necho "*.log" >> .gitignore' },
  { id: 'build_artifacts', severity: 'high', test: f => f.startsWith('dist/') || f.startsWith('build/') || f.startsWith('.next/'), message: 'Build artifacts committed (dist/ or build/)', fix: 'git rm -r --cached dist/ build/\necho "dist/\nbuild/" >> .gitignore' },
  { id: 'pycache', severity: 'high', test: f => f.includes('__pycache__') || f.endsWith('.pyc'), message: 'Python cache files committed', fix: 'git rm -r --cached **/__pycache__ **/*.pyc\necho "__pycache__/\n*.pyc" >> .gitignore' },
  { id: 'java_class', severity: 'high', test: f => f.endsWith('.class'), message: 'Java .class files committed', fix: 'git rm --cached **/*.class\necho "*.class" >> .gitignore' },
  { id: 'archives', severity: 'medium', test: f => /\.(zip|tar\.gz|tgz|rar|7z)$/.test(f), message: 'Archive files committed', fix: 'git rm --cached <archive-file>\nConsider using releases for binary artifacts.' },
  { id: 'coverage', severity: 'medium', test: f => f.startsWith('coverage/') || f.startsWith('.nyc_output/'), message: 'Test coverage reports committed', fix: 'git rm -r --cached coverage/\necho "coverage/" >> .gitignore' },
  { id: 'vendor', severity: 'medium', test: f => f.startsWith('vendor/') && !f.includes('go'), message: 'Vendor directory committed', fix: 'Consider using a package manager lockfile instead of committing vendor/.' },
];

const REQUIRED_FILES = [
  { file: '.gitignore', severity: 'critical', why: 'Prevents committing sensitive and generated files' },
  { file: 'README.md', severity: 'critical', why: 'Essential for project discoverability and onboarding' },
  { file: 'LICENSE', severity: 'high', why: 'Clarifies how others can use your code legally' },
  { file: '.env.example', severity: 'medium', why: 'Shows required environment variables without exposing values' },
  { file: 'CONTRIBUTING.md', severity: 'low', why: 'Helps contributors understand how to participate' },
];

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp4', '.mov', '.pdf', '.zip', '.tar', '.gz', '.rar', '.woff', '.woff2', '.eot', '.ttf'];

function getScoreColor(s) { return s >= 80 ? '#22c55e' : s >= 60 ? '#eab308' : s >= 40 ? '#f97316' : '#ef4444'; }

function calcHealthScore(issues, missing) {
  let score = 100;
  issues.forEach(i => { score -= i.severity === 'critical' ? 20 : i.severity === 'high' ? 10 : i.severity === 'medium' ? 5 : 2; });
  missing.forEach(m => { score -= m.severity === 'critical' ? 15 : m.severity === 'high' ? 10 : 5; });
  return Math.max(0, Math.min(100, score));
}

function AnimatedScore({ target, color }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let start = 0; const duration = 1000; const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(start + (target - start) * ease));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  const radius = 54; const circ = 2 * Math.PI * radius;
  const offset = circ - (current / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset .05s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 32, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{current}</span>
        <span style={{ fontSize: 11, color: '#475569', marginTop: 2, fontWeight: 600 }}>/ 100</span>
      </div>
    </div>
  );
}

export default function RepoAudit() {
  const { owner, repo } = useParams();

  const { incrementGeneration, isAtLimit, openUpgradeModal, addRecentRepo, canUseFeature } = useApp();
  const [url, setUrl] = useState(`https://github.com/${owner}/${repo}`);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('issues');
  const [expanded, setExpanded] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState('');
  const [aiError, setAiError] = useState('');

  const doScan = async () => {
    const parsed = parseUrl(url);
    if (!parsed) { setError('Enter a valid GitHub repo URL'); return; }
    setError(''); setScanning(true); setResult(null); setAiReport('');
    const msgs = ['Fetching repo metadata...', 'Scanning file tree...', 'Checking for issues...', 'Detecting large files...', 'Calculating health score...'];
    let mi = 0; setScanMsg(msgs[0]);
    const interval = setInterval(() => { mi = Math.min(mi + 1, msgs.length - 1); setScanMsg(msgs[mi]); }, 700);
    try {
      const { owner, repo } = parsed;
      const ctx = await fetchRepoContext(owner, repo);
      const files = ctx.files || [];
      addRecentRepo(owner, repo);

      // Detect committed issues
      const issues = [];
      const seenIds = new Set();
      for (const f of files) {
        for (const pattern of COMMITTED_PATTERNS) {
          if (!seenIds.has(pattern.id) && pattern.test(f)) {
            issues.push({ ...pattern, file: f }); seenIds.add(pattern.id);
          }
        }
      }
      issues.sort((a, b) => { const ord = { critical: 0, high: 1, medium: 2, low: 3 }; return ord[a.severity] - ord[b.severity]; });

      // Detect missing files
      const missing = REQUIRED_FILES.filter(r => !files.some(f => f === r.file || f.endsWith('/' + r.file)));
      missing.sort((a, b) => { const ord = { critical: 0, high: 1, medium: 2, low: 3 }; return ord[a.severity] - ord[b.severity]; });

      // Detect large files (heuristic from tree â€” size not available, detect by extension)
      const largeFileHints = files.filter(f => IMAGE_EXTS.some(ext => f.toLowerCase().endsWith(ext)));

      const healthScore = calcHealthScore(issues, missing);

      setResult({ owner, repo, meta: ctx.meta, files, issues, missing, largeFiles: largeFileHints, healthScore, langs: ctx.langs });
    } catch (e) {
      setError(e.message || 'Failed to scan repository');
    } finally {
      clearInterval(interval); setScanning(false);
    }
  };

  const generateAIReport = async () => {
    if (isAtLimit) { openUpgradeModal('AI Report', 'Get AI-generated cleanup reports'); return; }
    setAiLoading(true); setAiError(''); setAiReport('');
    try {
      const { owner, repo, meta, issues, missing, largeFiles, healthScore, langs } = result;
      const langList = Object.keys(langs).join(', ');
      const issueList = issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`).join('\n');
      const missingList = missing.map(m => `[${m.severity.toUpperCase()}] Missing: ${m.file} â€” ${m.why}`).join('\n');
      const prompt = `You are a senior DevOps and repository hygiene expert. Generate a comprehensive audit report for this GitHub repository.

Repository: ${owner}/${repo}
Description: ${meta?.description || 'None'}
Languages: ${langList}
Stars: ${meta?.stargazers_count || 0}
Health Score: ${healthScore}/100

DETECTED ISSUES:
${issueList || 'None'}

MISSING REQUIRED FILES:
${missingList || 'None'}

BINARY/LARGE FILES IN TREE:
${largeFiles.slice(0, 20).join('\n') || 'None detected'}

Generate a markdown report with:
1. ## Executive Summary â€” 2-3 sentences on overall state
2. ## Critical Actions â€” Each issue with exact git commands to fix
3. ## Recommended Improvements â€” Priority-ordered list
4. ## Complete .gitignore Template â€” Tailored to detected language stack (${langList})
5. ## Next Steps â€” 30-day improvement roadmap

Be specific, practical, and direct. Include exact commands.`;
      const report = await callAI([{ role: 'user', content: prompt }], 'You are a repository health expert. Return a thorough, actionable audit report in clean markdown.', 2000);
      setAiReport(report);
      incrementGeneration();
    } catch (e) { setAiError(e.message || 'AI report failed'); }
    finally { setAiLoading(false); }
  };

  const scoreColor = result ? getScoreColor(result.healthScore) : ACCENT;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>ðŸ”</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-.02em' }}>Repo Audit</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Scan for security issues, missing files, and committed junk</p>
          </div>
        </div>
        
        {error && <div style={{ marginTop: 10, padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      </div>

      {scanning && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 16, animation: 'spin 2s linear infinite', display: 'inline-block' }}>ðŸ”</div>
          <div style={{ color: '#94a3b8', fontSize: 13, fontFamily: "'JetBrains Mono',monospace' " }}>{scanMsg}</div>
        </div>
      )}

      {result && (
        <div className="fade-up">
          {/* Repo header */}
          <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '18px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{result.owner}/{result.repo}</div>
              {result.meta?.description && <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>{result.meta.description}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {result.meta?.language && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1e293b', color: '#94a3b8' }}>{result.meta.language}</span>}
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1e293b', color: '#94a3b8' }}>â­ {result.meta?.stargazers_count?.toLocaleString() || 0}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1e293b', color: '#94a3b8' }}>{result.files.length} files</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <AnimatedScore target={result.healthScore} color={scoreColor} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{result.healthScore >= 80 ? 'Healthy' : result.healthScore >= 60 ? 'Needs Attention' : result.healthScore >= 40 ? 'At Risk' : 'Critical'}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Health Score</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {result.issues.filter(i => i.severity === 'critical').length > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#ef444415', color: '#ef4444', fontWeight: 700 }}>{result.issues.filter(i => i.severity === 'critical').length} CRITICAL</span>}
                  {result.issues.filter(i => i.severity === 'high').length > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f9731615', color: '#f97316', fontWeight: 700 }}>{result.issues.filter(i => i.severity === 'high').length} HIGH</span>}
                  {result.missing.length > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#eab30815', color: '#eab308', fontWeight: 700 }}>{result.missing.length} MISSING</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tab-bar" style={{ '--accent': ACCENT }}>
            {[
              { id: 'issues', label: `Issues (${result.issues.length})` },
              { id: 'missing', label: `Missing Files (${result.missing.length})` },
              { id: 'large', label: `Binary/Large (${result.largeFiles.length})` },
            ].map(t => (
              <button key={t.id} className={`tab-btn${activeTab === t.id ? ' active' : ''}`} style={{ '--accent': ACCENT }} onClick={() => setActiveTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {activeTab === 'issues' && (
            <div>
              {result.issues.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#22c55e' }}>âœ“ No committed junk or secrets detected!</div>
              ) : (
                result.issues.map((issue, i) => (
                  <div key={i} style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                    <button onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', textAlign: 'left' }}>
                      <SeverityBadge severity={issue.severity} />
                      <span style={{ flex: 1, fontSize: 13, color: '#f1f5f9', fontWeight: 500 }}>{issue.message}</span>
                      {issue.file && <span style={{ fontSize: 11, color: '#475569', fontFamily: "'JetBrains Mono',monospace", maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.file}</span>}
                      <span style={{ color: '#475569', fontSize: 12 }}>{expanded[i] ? 'â–²' : 'â–¼'}</span>
                    </button>
                    {expanded[i] && (
                      <div style={{ padding: '0 16px 14px', borderTop: '1px solid #1e293b' }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, marginTop: 10 }}>Fix:</div>
                        <pre style={{ background: '#020817', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#a5f3fc', fontFamily: "'JetBrains Mono',monospace", margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{issue.fix}</pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'missing' && (
            <div>
              {result.missing.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#22c55e' }}>âœ“ All required files present!</div>
              ) : (
                result.missing.map((m, i) => (
                  <div key={i} style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 8, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <SeverityBadge severity={m.severity} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontFamily: "'JetBrains Mono',monospace" }}>{m.file}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{m.why}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'large' && (
            <div>
              {result.largeFiles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#22c55e' }}>âœ“ No large binary files detected in tree.</div>
              ) : (
                <div>
                  <div style={{ padding: '10px 14px', background: '#eab30810', border: '1px solid #eab30830', borderRadius: 8, color: '#eab308', fontSize: 12, marginBottom: 12 }}>
                    âš ï¸ The following binary/media files are tracked in git. Consider using Git LFS for files &gt;1MB.
                  </div>
                  {result.largeFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#020617', border: '1px solid #1e293b', borderRadius: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", flex: 1 }}>{f}</span>
                      <span style={{ fontSize: 10, padding: '2px 7px', background: '#1e293b', borderRadius: 3, color: '#475569' }}>binary</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#020617', border: '1px solid #1e293b', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Fix with Git LFS:</div>
                    <pre style={{ background: '#020817', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: '#a5f3fc', fontFamily: "'JetBrains Mono',monospace", margin: 0 }}>git lfs track "*.png"\ngit lfs track "*.mp4"\ngit add .gitattributes</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Report */}
          <div style={{ marginTop: 24, padding: '18px 20px', background: '#020617', border: '1px solid #1e293b', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiReport ? 16 : 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>AI Full Report</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>Complete audit with exact fix commands + .gitignore template</div>
              </div>
              <button onClick={generateAIReport} disabled={aiLoading} className="btn btn-primary" style={{ '--accent': ACCENT, background: aiLoading ? '#1e293b' : ACCENT }}>
                {aiLoading ? 'â³ Generating...' : 'ðŸ¤– Generate AI Report'}
              </button>
            </div>
            {aiError && <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13 }}>{aiError}</div>}
            {aiReport && <OutputBox content={aiReport} filename={`AUDIT-${result.owner}-${result.repo}.md`} accentColor={ACCENT} />}
          </div>
        </div>
      )}
    </div>
  );
}
