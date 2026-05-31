import React, { useState, useRef } from 'react';
import { parseUrl, ghFetch, tryRaw } from '../utils/github';
import { callAI } from '../utils/ai';
import { dlMd } from '../utils/markdown';
import { useApp } from '../context/AppContext';
import UrlInput from '../components/shared/UrlInput';
import SectionCard from '../components/shared/SectionCard';
import ProBadge from '../components/shared/ProBadge';

const ACCENT = '#6366F1';

const ALL_LANGS = [
  { code: 'es', flag: 'ðŸ‡ªðŸ‡¸', name: 'Spanish' },
  { code: 'fr', flag: 'ðŸ‡«ðŸ‡·', name: 'French' },
  { code: 'zh', flag: 'ðŸ‡¨ðŸ‡³', name: 'Chinese (Simplified)' },
  { code: 'de', flag: 'ðŸ‡©ðŸ‡ª', name: 'German' },
  { code: 'pt', flag: 'ðŸ‡§ðŸ‡·', name: 'Portuguese' },
  { code: 'ja', flag: 'ðŸ‡¯ðŸ‡µ', name: 'Japanese' },
  { code: 'ko', flag: 'ðŸ‡°ðŸ‡·', name: 'Korean' },
  { code: 'ar', flag: 'ðŸ‡¸ðŸ‡¦', name: 'Arabic', rtl: true },
  { code: 'hi', flag: 'ðŸ‡®ðŸ‡³', name: 'Hindi' },
  { code: 'ru', flag: 'ðŸ‡·ðŸ‡º', name: 'Russian' },
  { code: 'id', flag: 'ðŸ‡®ðŸ‡©', name: 'Indonesian' },
  { code: 'tr', flag: 'ðŸ‡¹ðŸ‡·', name: 'Turkish' },
  { code: 'it', flag: 'ðŸ‡®ðŸ‡¹', name: 'Italian' },
  { code: 'nl', flag: 'ðŸ‡³ðŸ‡±', name: 'Dutch' },
  { code: 'pl', flag: 'ðŸ‡µðŸ‡±', name: 'Polish' },
  { code: 'sw', flag: 'ðŸ‡°ðŸ‡ª', name: 'Swahili' },
  { code: 'yo', flag: 'ðŸ‡³ðŸ‡¬', name: 'Yoruba' },
  { code: 'ha', flag: 'ðŸ‡³ðŸ‡¬', name: 'Hausa' },
  { code: 'vi', flag: 'ðŸ‡»ðŸ‡³', name: 'Vietnamese' },
  { code: 'th', flag: 'ðŸ‡¹ðŸ‡­', name: 'Thai' },
];

const DOC_OPTIONS = ['README.md', 'CONTRIBUTING.md', 'QUICKSTART.md', 'INSTALL.md', 'docs/index.md'];

export default function MultiLanguage() {
  const { owner, repo } = useParams();

  const { incrementGeneration, isAtLimit, openUpgradeModal, canUseFeature } = useApp();
  const [inputMode, setInputMode] = useState('repo');
  const [url, setUrl] = useState(`https://github.com/${owner}/${repo}`);
  const [selectedDoc, setSelectedDoc] = useState('README.md');
  const [customText, setCustomText] = useState('');
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [repoData, setRepoData] = useState(null);
  const [repoError, setRepoError] = useState('');
  const [formality, setFormality] = useState('neutral');
  const [preserveCode, setPreserveCode] = useState(true);
  const [selected, setSelected] = useState(['es', 'fr', 'zh']);
  const [outputs, setOutputs] = useState({});
  const [progress, setProgress] = useState(null); // {current, total, lang}
  const [activeOutput, setActiveOutput] = useState(null);

  const planLangCount = canUseFeature('multiLanguageCount') || 3;

  const loadRepo = async () => {
    const parsed = parseUrl(url);
    if (!parsed) { setRepoError('Enter a valid GitHub repo URL'); return; }
    setRepoError(''); setLoadingRepo(true); setRepoData(null); setOutputs({});
    try {
      const { owner, repo } = parsed;
      const meta = await ghFetch(`/repos/${owner}/${repo}`);
      if (!meta) throw new Error('Repository not found');
      setRepoData({ owner, repo, meta, branch: meta.default_branch });
    } catch (e) { setRepoError(e.message); }
    finally { setLoadingRepo(false); }
  };

  const getSourceText = async () => {
    if (inputMode === 'custom') return customText;
    if (!repoData) return '';
    const { owner, repo, branch } = repoData;
    const content = await tryRaw(owner, repo, selectedDoc, branch);
    return content || '';
  };

  const toggleLang = (code, idx) => {
    if (idx >= planLangCount) {
      openUpgradeModal('Multi-Language', 'Translate to more languages');
      return;
    }
    setSelected(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const translate = async () => {
    if (isAtLimit) { openUpgradeModal('Multi-Language', 'Translate documentation to multiple languages'); return; }
    const text = await getSourceText();
    if (!text.trim()) { setRepoError('No content to translate. Load a repo or paste text.'); return; }

    const langs = ALL_LANGS.filter(l => selected.includes(l.code));
    if (langs.length === 0) { setRepoError('Select at least one language'); return; }

    setOutputs({}); setProgress({ current: 0, total: langs.length, lang: '' });

    const formalityNote = formality === 'formal' ? 'Use formal, professional language.' : formality === 'casual' ? 'Use casual, friendly language.' : 'Use neutral, clear language.';
    const codeNote = preserveCode ? 'Preserve all code blocks, technical terms, commands, file names, and variable names in their original English form. Only translate prose/natural language text.' : 'Translate all text including technical terms where appropriate language equivalents exist.';

    for (let i = 0; i < langs.length; i++) {
      const lang = langs[i];
      setProgress({ current: i + 1, total: langs.length, lang: lang.name });

      if (isAtLimit && i > 0) {
        openUpgradeModal('Multi-Language', 'Continue translating to more languages');
        break;
      }

      try {
        const prompt = `Translate the following markdown documentation to ${lang.name} (${lang.code}).
${formalityNote}
${codeNote}
Maintain all markdown formatting (headers, lists, code blocks, links, badges).
${lang.rtl ? 'This language is written right-to-left. Preserve the markdown structure.' : ''}

---
${text.slice(0, 6000)}
---

Return ONLY the translated markdown, no commentary.`;

        const translated = await callAI([{ role: 'user', content: prompt }], `You are a professional technical translator. Translate accurately while preserving markdown formatting.`, 3000);
        setOutputs(prev => ({ ...prev, [lang.code]: translated }));
        if (i === 0) setActiveOutput(lang.code);
        incrementGeneration();
      } catch (e) {
        setOutputs(prev => ({ ...prev, [lang.code]: `Translation failed: ${e.message}` }));
      }
    }
    setProgress(null);
  };

  const downloadAll = () => {
    ALL_LANGS.filter(l => outputs[l.code]).forEach(l => {
      const baseName = inputMode === 'repo' ? selectedDoc.replace('.md', '') : 'doc';
      dlMd(outputs[l.code], `${baseName}.${l.code}.md`);
    });
  };

  const completedLangs = ALL_LANGS.filter(l => outputs[l.code]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>ðŸŒ</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-.02em' }}>Multi-Language</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Translate your documentation to {planLangCount === Infinity ? 'all 20' : planLangCount} languages</p>
          </div>
        </div>

        {/* Input mode */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['repo', 'ðŸ”— GitHub Repo'], ['custom', 'ðŸ“‹ Custom Text']].map(([m, label]) => (
            <button key={m} onClick={() => setInputMode(m)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: inputMode === m ? ACCENT : 'transparent', color: inputMode === m ? '#fff' : '#475569', border: `1px solid ${inputMode === m ? ACCENT : '#1e293b'}` }}>{label}</button>
          ))}
        </div>

        {inputMode === 'repo' ? (
          <div>
            
            {repoData && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>Translate:</span>
                <select value={selectedDoc} onChange={e => setSelectedDoc(e.target.value)} style={{ padding: '7px 12px', borderRadius: 6 }}>
                  {DOC_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span style={{ fontSize: 12, color: '#22c55e' }}>âœ“ {repoData.owner}/{repoData.repo}</span>
              </div>
            )}
          </div>
        ) : (
          <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Paste your markdown content here..." rows={8} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, resize: 'vertical', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }} />
        )}
        {repoError && <div style={{ marginTop: 8, padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>{repoError}</div>}
      </div>

      {/* Translation options */}
      <SectionCard title="Translation Options" accentColor={ACCENT} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 6 }}>FORMALITY</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['formal', 'neutral', 'casual'].map(f => (
                <button key={f} onClick={() => setFormality(f)} style={{ padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', background: formality === f ? ACCENT : '#0f172a', color: formality === f ? '#fff' : '#94a3b8', border: `1px solid ${formality === f ? ACCENT : '#1e293b'}` }}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setPreserveCode(p => !p)} style={{ width: 38, height: 22, borderRadius: 11, background: preserveCode ? ACCENT : '#1e293b', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: preserveCode ? 18 : 3, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left .2s' }} />
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Preserve code blocks & technical terms in English</span>
          </div>
        </div>
      </SectionCard>

      {/* Language selector */}
      <SectionCard title={`Languages (${selected.length} selected)`} accentColor={ACCENT} extra={
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setSelected(ALL_LANGS.slice(0, planLangCount).map(l => l.code))} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: '#1e293b', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>All Available</button>
          <button onClick={() => setSelected([])} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: '#1e293b', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>Clear</button>
        </div>
      } style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {ALL_LANGS.map((lang, idx) => {
            const locked = idx >= planLangCount;
            const isSelected = selected.includes(lang.code);
            const done = !!outputs[lang.code];
            return (
              <div key={lang.code} onClick={() => toggleLang(lang.code, idx)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: locked ? 'default' : 'pointer', background: done ? '#052e1640' : isSelected ? `${ACCENT}20` : '#0f172a', border: `1px solid ${done ? '#22c55e40' : isSelected ? `${ACCENT}50` : '#1e293b'}`, position: 'relative', opacity: locked && !isSelected ? 0.6 : 1, transition: 'all .15s' }}>
                <span style={{ fontSize: 18 }}>{lang.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: done ? '#22c55e' : isSelected ? ACCENT : '#94a3b8' }}>{lang.name}</div>
                  <div style={{ fontSize: 10, color: '#475569', fontFamily: "'JetBrains Mono',monospace" }}>{lang.code}{lang.rtl ? ' Â· RTL' : ''}</div>
                </div>
                {done && <span style={{ fontSize: 14, flexShrink: 0 }}>âœ“</span>}
                {locked && !done && <span style={{ fontSize: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>PRO</span>}
                {!locked && isSelected && !done && <div style={{ width: 8, height: 8, borderRadius: 4, background: ACCENT, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Progress */}
      {progress && (
        <div style={{ marginBottom: 16, padding: '14px 16px', background: '#020617', border: '1px solid #1e293b', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#94a3b8' }}>
            <span>Translating <strong style={{ color: '#f1f5f9' }}>{progress.lang}</strong>...</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%`, background: ACCENT }} /></div>
        </div>
      )}

      {/* Translate button */}
      <button onClick={translate} disabled={!!progress || selected.length === 0} className="btn btn-primary" style={{ background: ACCENT, width: '100%', justifyContent: 'center', padding: '12px', marginBottom: 20, fontSize: 14 }}>
        {progress ? `Translating ${progress.lang} (${progress.current}/${progress.total})...` : `ðŸŒ Translate to ${selected.length} language${selected.length === 1 ? '' : 's'}`}
      </button>

      {/* Output tabs */}
      {completedLangs.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>{completedLangs.length} translation{completedLangs.length > 1 ? 's' : ''} complete</div>
            {completedLangs.length > 1 && (
              <button onClick={downloadAll} className="btn btn-ghost" style={{ fontSize: 12 }}>â¬‡ Download All</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {completedLangs.map(l => (
              <button key={l.code} onClick={() => setActiveOutput(l.code)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: activeOutput === l.code ? ACCENT : '#020617', color: activeOutput === l.code ? '#fff' : '#94a3b8', border: `1px solid ${activeOutput === l.code ? ACCENT : '#1e293b'}` }}>
                {l.flag} {l.name}
              </button>
            ))}
          </div>
          {activeOutput && outputs[activeOutput] && (() => {
            const lang = ALL_LANGS.find(l => l.code === activeOutput);
            const baseName = inputMode === 'repo' ? selectedDoc.replace('.md', '') : 'doc';
return (
              <div dir={lang?.rtl ? 'rtl' : 'ltr'}>
                {lang?.rtl && <div style={{ fontSize: 11, padding: '4px 10px', background: '#6366f115', border: '1px solid #6366f130', borderRadius: 4, color: '#818cf8', marginBottom: 8, display: 'inline-block' }}>RTL language â€” right-to-left text</div>}
                <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{lang?.flag}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', flex: 1 }}>{lang?.name} Â· {baseName}.{activeOutput}.md</span>
                    <button onClick={() => dlMd(outputs[activeOutput], `${baseName}.${activeOutput}.md`)} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}>â¬‡ .md</button>
                  </div>
                  <pre style={{ padding: '16px', margin: 0, overflowX: 'auto', fontSize: 12, color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.7, maxHeight: 500, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{outputs[activeOutput]}</pre>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
