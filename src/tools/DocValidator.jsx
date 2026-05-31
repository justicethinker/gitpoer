import React, { useState, useRef } from 'react';
import { callAI, callAIJSON } from '../utils/ai';
import { renderMd, dlMd, copyToClipboard } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import SectionCard from '../components/shared/SectionCard';
import SeverityBadge from '../components/shared/SeverityBadge';
import ProBadge from '../components/shared/ProBadge';

const ACCENT = '#0EA5E9';

const DIMENSIONS = [
  { id: 'completeness', label: 'Completeness', emoji: 'ðŸ“‹', color: '#6366F1' },
  { id: 'clarity', label: 'Clarity', emoji: 'ðŸ’¡', color: '#0EA5E9' },
  { id: 'structure', label: 'Structure', emoji: 'ðŸ—ï¸', color: '#8B5CF6' },
  { id: 'grammar', label: 'Grammar', emoji: 'âœï¸', color: '#3b82f6' },
  { id: 'technical', label: 'Technical', emoji: 'âš™ï¸', color: '#F59E0B' },
  { id: 'formatting', label: 'Formatting', emoji: 'ðŸŽ¨', color: '#EC4899' },
];

const DOC_TYPES = ['README', 'API Docs', 'Contributing Guide', 'Tutorial', 'Quick Start', 'Architecture Doc', 'User Manual', 'Release Notes'];
const AUDIENCES = ['Developers', 'Non-technical users', 'New contributors', 'Senior engineers', 'Students'];

function scoreToGrade(s) { return s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F'; }
function scoreToColor(s) { return s >= 80 ? '#22c55e' : s >= 60 ? '#84cc16' : s >= 45 ? '#eab308' : '#ef4444'; }

function AnimatedNumber({ target, color }) {
  const [cur, setCur] = React.useState(0);
  React.useEffect(() => {
    let start = Date.now(); const dur = 1000;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / dur);
      setCur(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return <span style={{ fontSize: 64, fontWeight: 900, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{cur}</span>;
}

export default function DocValidator() {
  const { owner, repo } = useParams();

  const { incrementGeneration, isAtLimit, openUpgradeModal, canUseFeature } = useApp();
  const [docType, setDocType] = useState('README');
  const [audience, setAudience] = useState('Developers');
  const [inputMode, setInputMode] = useState('paste');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('scores');
  const [expanded, setExpanded] = useState({});
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.match(/\.(md|txt)$/)) { setError('Only .md and .txt files are supported'); return; }
    setFileName(file.name); setError('');
    const reader = new FileReader();
    reader.onload = e => setText(e.target.result);
    reader.readAsText(file);
  };

  const analyze = async () => {
    if (!text.trim()) { setError('Paste or upload a document first'); return; }
    if (isAtLimit) { openUpgradeModal('Doc Validator', 'Analyze and improve your documentation'); return; }
    setAnalyzing(true); setResult(null); setError('');
    try {
      const systemPrompt = `You are a technical writing expert. Analyze the provided documentation and return ONLY a valid JSON object. No extra text.`;
      const prompt = `Analyze this ${docType} document for an audience of ${audience}.

Return ONLY this JSON structure:
{
  "overallScore": <0-100 integer>,
  "grade": "<A|B|C|D|F>",
  "perDimension": {
    "completeness": {"score": <0-100>, "notes": "<1 sentence>"},
    "clarity": {"score": <0-100>, "notes": "<1 sentence>"},
    "structure": {"score": <0-100>, "notes": "<1 sentence>"},
    "grammar": {"score": <0-100>, "notes": "<1 sentence>"},
    "technical": {"score": <0-100>, "notes": "<1 sentence>"},
    "formatting": {"score": <0-100>, "notes": "<1 sentence>"}
  },
  "summary": "<2-3 sentences>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "criticalIssues": [{"severity": "<critical|high|medium|low>", "issue": "<issue>", "fix": "<specific fix>"}],
  "missingSections": ["<section>"],
  "typos": [{"original": "<wrong>", "suggestion": "<correct>", "context": "<surrounding text>"}],
  "brokenFormatting": ["<formatting issue>"],
  "topImprovement": "<single most impactful improvement>",
  "improvedVersion": "<full rewritten markdown document>"
}

DOCUMENT TO ANALYZE:
${text.slice(0, 4000)}`;

      const parsed = await callAIJSON([{ role: 'user', content: prompt }], systemPrompt, 4000);
      if (!parsed || typeof parsed.overallScore !== 'number') throw new Error('AI returned unexpected format. Try again.');
      setResult(parsed);
      incrementGeneration();
    } catch (e) { setError(e.message); }
    finally { setAnalyzing(false); }
  };

  const charCount = text.length;
  const lineCount = text.split('\n').length;
  const canImproved = canUseFeature('docValidatorImproved');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>âœ…</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-.02em' }}>Doc Validator</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Score and improve any documentation in 6 dimensions</p>
          </div>
        </div>

        {/* Config row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 11, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 5 }}>DOC TYPE</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 7 }}>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 11, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 5 }}>AUDIENCE</label>
            <select value={audience} onChange={e => setAudience(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 7 }}>
              {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Input mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['paste', 'ðŸ“‹ Paste Text'], ['upload', 'ðŸ“ Upload File']].map(([m, label]) => (
            <button key={m} onClick={() => setInputMode(m)} style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: inputMode === m ? ACCENT : 'transparent', color: inputMode === m ? '#fff' : '#475569', border: `1px solid ${inputMode === m ? ACCENT : '#1e293b'}` }}>{label}</button>
          ))}
        </div>

        {inputMode === 'paste' ? (
          <div>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste your markdown or text document here..." rows={12} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, resize: 'vertical', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, lineHeight: 1.7 }} />
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{charCount.toLocaleString()} chars Â· {lineCount} lines</div>
          </div>
        ) : (
          <div
            onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${dragging ? ACCENT : '#1e293b'}`, borderRadius: 10, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s', background: dragging ? `${ACCENT}08` : 'transparent' }}>
            <input ref={fileRef} type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            <div style={{ fontSize: 32, marginBottom: 10 }}>ðŸ“„</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{fileName ? `âœ“ ${fileName}` : 'Drag & drop a .md or .txt file, or click to browse'}</div>
            {text && <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>{charCount.toLocaleString()} chars loaded</div>}
          </div>
        )}

        {error && <div style={{ marginTop: 10, padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>{error}</div>}

        <button onClick={analyze} disabled={analyzing || !text.trim()} className="btn btn-primary" style={{ background: ACCENT, width: '100%', justifyContent: 'center', padding: '12px', marginTop: 14, fontSize: 14 }}>
          {analyzing ? 'ðŸ” Analysing document...' : 'ðŸ” Analyze Document'}
        </button>
      </div>

      {result && (
        <div className="fade-up">
          {/* Score hero */}
          <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 16, padding: '28px 24px', marginBottom: 20, textAlign: 'center' }}>
            <AnimatedNumber target={result.overallScore} color={scoreToColor(result.overallScore)} />
            <span style={{ fontSize: 64, fontWeight: 900, color: '#1e293b', fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}> / 100</span>
            <div style={{ fontSize: 36, fontWeight: 900, color: scoreToColor(result.overallScore), marginTop: 4 }}>{result.grade}</div>
            <div style={{ fontSize: 14, color: '#94a3b8', maxWidth: 500, margin: '12px auto 0' }}>{result.summary}</div>
            {result.topImprovement && <div style={{ marginTop: 14, padding: '10px 16px', background: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, borderRadius: 8, fontSize: 13, color: '#7dd3fc', maxWidth: 500, margin: '12px auto 0', display: 'inline-block' }}>ðŸ’¡ Top improvement: {result.topImprovement}</div>}
          </div>

          {/* Tabs */}
          <div className="tab-bar">
            {[['scores', 'ðŸ“Š Scores'], ['issues', `âš ï¸ Issues (${result.criticalIssues?.length || 0})`], ['grammar', `âœï¸ Grammar (${result.typos?.length || 0})`], ['missing', 'ðŸ—‚ï¸ Missing'], ['improved', 'âœ¨ Improved']].map(([id, label]) => (
              <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`} style={{ '--accent': ACCENT }} onClick={() => setActiveTab(id)}>{label}</button>
            ))}
          </div>

          {activeTab === 'scores' && (
            <div>
              {DIMENSIONS.map(dim => {
                const data = result.perDimension?.[dim.id];
                const score = data?.score || 0;
                return (
                  <div key={dim.id} style={{ marginBottom: 12, background: '#020617', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span>{dim.emoji}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{dim.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: dim.color, fontFamily: "'JetBrains Mono',monospace" }}>{score}</span>
                    </div>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${score}%`, background: dim.color }} /></div>
                    {data?.notes && <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{data.notes}</div>}
                  </div>
                );
              })}
              {result.strengths?.length > 0 && (
                <div style={{ padding: '14px 16px', background: '#052e1640', border: '1px solid #16653430', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 8, letterSpacing: '.06em' }}>STRENGTHS</div>
                  {result.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>âœ“ {s}</div>)}
                </div>
              )}
            </div>
          )}

          {activeTab === 'issues' && (
            <div>
              {(!result.criticalIssues || result.criticalIssues.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#22c55e' }}>âœ“ No critical issues found!</div>
              ) : (
                result.criticalIssues.sort((a, b) => { const o = {critical:0,high:1,medium:2,low:3}; return o[a.severity]-o[b.severity]; }).map((issue, i) => (
                  <div key={i} style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                    <button onClick={() => setExpanded(e => ({...e, [i]: !e[i]}))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', textAlign: 'left' }}>
                      <SeverityBadge severity={issue.severity} />
                      <span style={{ flex: 1, fontSize: 13, color: '#f1f5f9' }}>{issue.issue}</span>
                      <span style={{ color: '#475569', fontSize: 12 }}>{expanded[i] ? 'â–²' : 'â–¼'}</span>
                    </button>
                    {expanded[i] && (
                      <div style={{ padding: '0 16px 14px', borderTop: '1px solid #1e293b' }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}><strong style={{color:'#f1f5f9'}}>Fix: </strong>{issue.fix}</div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'grammar' && (
            <div>
              {(!result.typos || result.typos.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#22c55e' }}>âœ“ No typos or grammar issues found!</div>
              ) : (
                result.typos.map((t, i) => (
                  <div key={i} style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <code style={{ background: '#ef444420', color: '#ef4444', padding: '2px 8px', borderRadius: 4, fontSize: 13, fontFamily: "'JetBrains Mono',monospace", textDecoration: 'line-through' }}>{t.original}</code>
                      <span style={{ color: '#475569' }}>â†’</span>
                      <code style={{ background: '#22c55e20', color: '#22c55e', padding: '2px 8px', borderRadius: 4, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>{t.suggestion}</code>
                    </div>
                    {t.context && <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>Context: "...{t.context}..."</div>}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'missing' && (
            <div>
              {result.missingSections?.length > 0 && (
                <SectionCard title="Missing Sections" accentColor="#eab308" style={{ marginBottom: 16 }}>
                  {result.missingSections.map((s, i) => <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: 13, color: '#94a3b8', display: 'flex', gap: 8 }}>âš ï¸ <span>{s}</span></div>)}
                </SectionCard>
              )}
              {result.brokenFormatting?.length > 0 && (
                <SectionCard title="Formatting Issues" accentColor="#EC4899">
                  {result.brokenFormatting.map((f, i) => <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: 13, color: '#94a3b8', display: 'flex', gap: 8 }}>ðŸŽ¨ <span>{f}</span></div>)}
                </SectionCard>
              )}
            </div>
          )}

          {activeTab === 'improved' && (
            <div style={{ position: 'relative' }}>
              {!canImproved && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse,#02061799,#020617f0)', borderRadius: 12, gap: 12 }}>
                  <ProBadge feature="docValidatorImproved" description="Get a full AI-rewritten version of your document" />
                  <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Upgrade to Dev or Pro to unlock the improved version</div>
                </div>
              )}
              <div style={{ filter: canImproved ? 'none' : 'blur(4px)', pointerEvents: canImproved ? 'auto' : 'none' }}>
                {result.improvedVersion ? (
                  <div>
                    <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button onClick={() => copyToClipboard(result.improvedVersion)} className="btn btn-ghost" style={{ fontSize: 12 }}>Copy</button>
                      <button onClick={() => dlMd(result.improvedVersion, 'improved-doc.md')} className="btn btn-ghost" style={{ fontSize: 12 }}>Download .md</button>
                    </div>
                    <div className="md-output" style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: '20px', maxHeight: 600, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: renderMd(result.improvedVersion) || result.improvedVersion }} />
                  </div>
                ) : <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>Improved version not available.</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
