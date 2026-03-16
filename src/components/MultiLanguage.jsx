import { useState } from "react";

const GH = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

function parseUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}
async function ghFetch(path) {
  const r = await fetch(`${GH}${path}`);
  if (!r.ok) return null;
  return r.json();
}
async function tryRaw(owner, repo, file, branch) {
  for (const b of [branch, "main", "master"]) {
    try { const r = await fetch(`${RAW}/${owner}/${repo}/${b}/${file}`); if (r.ok) return r.text(); } catch {}
  }
  return null;
}

// ─── Language catalogue ───────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "es", name: "Spanish",    nativeName: "Español",    flag: "🇪🇸", speakers: "500M+" },
  { code: "fr", name: "French",     nativeName: "Français",   flag: "🇫🇷", speakers: "300M+" },
  { code: "de", name: "German",     nativeName: "Deutsch",    flag: "🇩🇪", speakers: "100M+" },
  { code: "pt", name: "Portuguese", nativeName: "Português",  flag: "🇧🇷", speakers: "250M+" },
  { code: "zh", name: "Chinese",    nativeName: "中文",        flag: "🇨🇳", speakers: "1B+" },
  { code: "ja", name: "Japanese",   nativeName: "日本語",      flag: "🇯🇵", speakers: "125M" },
  { code: "ko", name: "Korean",     nativeName: "한국어",      flag: "🇰🇷", speakers: "80M" },
  { code: "ar", name: "Arabic",     nativeName: "العربية",    flag: "🇸🇦", speakers: "400M+" },
  { code: "hi", name: "Hindi",      nativeName: "हिन्दी",      flag: "🇮🇳", speakers: "600M+" },
  { code: "ru", name: "Russian",    nativeName: "Русский",    flag: "🇷🇺", speakers: "260M+" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa",     flag: "🇮🇩", speakers: "270M+" },
  { code: "tr", name: "Turkish",    nativeName: "Türkçe",     flag: "🇹🇷", speakers: "80M" },
  { code: "it", name: "Italian",    nativeName: "Italiano",   flag: "🇮🇹", speakers: "65M" },
  { code: "nl", name: "Dutch",      nativeName: "Nederlands", flag: "🇳🇱", speakers: "24M" },
  { code: "pl", name: "Polish",     nativeName: "Polski",     flag: "🇵🇱", speakers: "45M" },
  { code: "sw", name: "Swahili",    nativeName: "Kiswahili",  flag: "🇰🇪", speakers: "200M+" },
  { code: "yo", name: "Yoruba",     nativeName: "Yorùbá",     flag: "🇳🇬", speakers: "50M+" },
  { code: "ha", name: "Hausa",      nativeName: "Hausa",      flag: "🇳🇬", speakers: "70M+" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳", speakers: "95M" },
  { code: "th", name: "Thai",       nativeName: "ภาษาไทย",    flag: "🇹🇭", speakers: "60M" },
];

// ─── Doc types ────────────────────────────────────────────────────────────────
const DOC_TYPES = {
  readme: { id: "readme", label: "README", icon: "📄", description: "Full project README — overview, setup, usage" },
  quickstart: { id: "quickstart", label: "Quick Start", icon: "⚡", description: "Fast-track setup guide" },
  contributing: { id: "contributing", label: "Contributing Guide", icon: "🤝", description: "How to contribute to the project" },
  api: { id: "api", label: "API Docs", icon: "🔌", description: "Endpoint documentation" },
  custom: { id: "custom", label: "Custom Text", icon: "✏️", description: "Paste your own text to translate" },
};

// ─── Repo fetch ───────────────────────────────────────────────────────────────
async function fetchRepoDoc(owner, repo, docType) {
  const [meta, tree] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}`),
    ghFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`),
  ]);
  if (!meta) throw new Error("Repo not found or is private.");
  const branch = meta.default_branch || "main";
  const files = (tree?.tree || []).map(f => f.path);

  let content = null;
  if (docType === "readme") {
    content = await tryRaw(owner, repo, "README.md", branch);
    if (!content) content = await tryRaw(owner, repo, "readme.md", branch);
  } else if (docType === "quickstart") {
    content = await tryRaw(owner, repo, "QUICKSTART.md", branch) ||
              await tryRaw(owner, repo, "docs/quickstart.md", branch) ||
              await tryRaw(owner, repo, "GETTING_STARTED.md", branch);
  } else if (docType === "contributing") {
    content = await tryRaw(owner, repo, "CONTRIBUTING.md", branch) ||
              await tryRaw(owner, repo, "contributing.md", branch);
  }

  return {
    owner, name: meta.name,
    description: meta.description || "",
    branch,
    content: content?.slice(0, 3000) || null,
    docType,
  };
}

// ─── Claude translation ───────────────────────────────────────────────────────
async function translateDoc(content, sourceLang, targetLang, targetLangName, docType, formalityLevel, preserveCode) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are an expert technical translator. You produce natural, fluent translations that read like they were originally written in the target language — not machine-translated. Return ONLY the translated markdown.`,
      messages: [{
        role: "user",
        content: `Translate the following ${docType} documentation from ${sourceLang} to ${targetLangName} (${targetLang}).

TRANSLATION RULES:
- Formality level: ${formalityLevel} (${formalityLevel === "formal" ? "professional, polished" : formalityLevel === "casual" ? "friendly, approachable" : "neutral technical"})
- ${preserveCode ? "Preserve all code blocks, commands, and technical terms in their original form (do NOT translate code, file names, or CLI commands)" : "Translate everything including technical explanations, but leave code blocks unchanged"}
- Translate section headers naturally — not word-for-word
- Adapt idioms and culturally-specific expressions to feel natural in ${targetLangName}
- Maintain all markdown formatting exactly (headers, bullets, bold, code blocks, links)
- Keep all URLs and links unchanged
- If the target language uses a different script (Chinese, Arabic, Japanese, etc.) ensure proper character encoding

CONTENT TO TRANSLATE:
${content}

Return ONLY the translated markdown. No explanation, no preamble.`
      }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

async function translateToMultiple(content, targetLangs, docType, formalityLevel, preserveCode, onProgress) {
  const results = {};
  for (const lang of targetLangs) {
    onProgress(lang.code, "generating");
    try {
      results[lang.code] = await translateDoc(content, "English", lang.code, lang.name, docType, formalityLevel, preserveCode);
    } catch { results[lang.code] = null; }
    onProgress(lang.code, "done");
    await new Promise(r => setTimeout(r, 150));
  }
  return results;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
function renderMd(md, dir = "ltr") {
  if (!md) return "";
  return `<div dir="${dir}" style="unicode-bidi:embed">` + md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#{3} (.+)$/gm, "<h3 style='color:#1e293b;font-size:1em;margin:.65em 0 .25em'>$1</h3>")
    .replace(/^#{2} (.+)$/gm, "<h2 style='color:#0f172a;font-size:1.12em;border-bottom:1px solid #e2e8f0;padding-bottom:.2em;margin:.8em 0 .3em'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style='color:#0f172a;font-size:1.3em;margin:.8em 0 .3em'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#0f172a'>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code style='background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:.83em;color:#e11d48;font-family:monospace'>$1</code>")
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px 14px;border-radius:7px;overflow-x:auto;margin:.5em 0"><code style="color:#334155;font-size:.85em;font-family:'JetBrains Mono',monospace">${c.trim()}</code></pre>`)
    .replace(/^\s*[-*] (.+)$/gm, "<li style='color:#475569;margin:.25em 0;font-size:13px'>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul style="padding-left:16px;margin:.35em 0">${m}</ul>`)
    .replace(/\n\n+/g, "</p><p style='color:#475569;margin:.4em 0;font-size:13.5px;line-height:1.75'>")
    .replace(/^(?!<[hpuolridbs]|<hr|<pre)(.+)$/gm, m => m.trim() ? `<p style="color:#475569;margin:.35em 0;font-size:13.5px;line-height:1.75">${m}</p>` : "")
    + "</div>";
}

const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);

function downloadMd(content, filename) {
  Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" })),
    download: filename,
  }).click();
}

function LangCard({ lang, selected, onToggle, status }) {
  const on = selected.includes(lang.code);
  const statusColor = { generating: "#f59e0b", done: "#4ade80" }[status] || "transparent";
  return (
    <div onClick={() => onToggle(lang.code)}
      style={{ padding: "9px 11px", borderRadius: 9, cursor: "pointer", border: `1.5px solid ${on ? "#6366f1" : "#e2e8f0"}`, background: on ? "#eef2ff" : "#fff", transition: "all .17s", position: "relative", overflow: "hidden" }}>
      {status && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: statusColor, transition: "all .3s" }} />}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{lang.flag}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: on ? "#4338ca" : "#334155" }}>{lang.nativeName}</div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>{lang.name} · {lang.speakers}</div>
        </div>
        {status === "done" && <span style={{ fontSize: 10, color: "#4ade80" }}>✓</span>}
        {status === "generating" && <span style={{ fontSize: 10, color: "#f59e0b", animation: "pulse 1s infinite" }}>⟳</span>}
        {!status && on && <span style={{ fontSize: 10, color: "#6366f1" }}>✓</span>}
      </div>
    </div>
  );
}

function TranslationOutput({ lang, content, repoName, docType }) {
  const [view, setView] = useState("preview");
  const [copied, setCopied] = useState(false);
  const dir = RTL_LANGS.has(lang.code) ? "rtl" : "ltr";
  const filename = `${docType.toUpperCase()}-${lang.code}.md`;
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
        <span style={{ fontSize: 16 }}>{lang.flag}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{lang.nativeName}</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{lang.name}</span>
        {RTL_LANGS.has(lang.code) && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", fontWeight: 600 }}>RTL</span>}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "#e2e8f0", borderRadius: 5, overflow: "hidden" }}>
          {["preview", "raw"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "3px 9px", border: "none", background: view === v ? "#cbd5e1" : "transparent", color: view === v ? "#0f172a" : "#94a3b8", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {v === "preview" ? "👁" : "⌨"}
            </button>
          ))}
        </div>
        <button onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid #e2e8f0", background: copied ? "#f0fdf4" : "#fff", color: copied ? "#16a34a" : "#64748b", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {copied ? "✓" : "Copy"}
        </button>
        <button onClick={() => downloadMd(content, filename)}
          style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ⬇ .md
        </button>
      </div>
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {view === "raw"
          ? <pre style={{ margin: 0, padding: 14, fontSize: 12, lineHeight: 1.75, color: "#475569", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'JetBrains Mono',monospace", direction: dir }}>{content}</pre>
          : <div style={{ padding: "16px 20px" }} dangerouslySetInnerHTML={{ __html: renderMd(content, dir) }} />
        }
      </div>
    </div>
  );
}

export default function MultiLanguage() {
  const [mode, setMode] = useState("repo"); // "repo" or "custom"
  const [url, setUrl] = useState("");
  const [docType, setDocType] = useState("readme");
  const [customText, setCustomText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sourceContent, setSourceContent] = useState(null);
  const [repoMeta, setRepoMeta] = useState(null);

  const [selectedLangs, setSelectedLangs] = useState(["es", "fr", "de", "zh"]);
  const [formality, setFormality] = useState("neutral");
  const [preserveCode, setPreserveCode] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [langStatus, setLangStatus] = useState({});
  const [outputs, setOutputs] = useState({});
  const [genError, setGenError] = useState("");
  const [activeOutput, setActiveOutput] = useState(null);

  const toggleLang = (code) => {
    setSelectedLangs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const loadRepo = async () => {
    const parsed = parseUrl(url.trim());
    if (!parsed) { setLoadError("Enter a valid GitHub URL."); return; }
    setLoadError(""); setRepoMeta(null); setSourceContent(null); setOutputs({}); setLoading(true);
    try {
      const data = await fetchRepoDoc(parsed.owner, parsed.repo, docType);
      setRepoMeta(data);
      setSourceContent(data.content);
      if (!data.content) setLoadError(`No ${docType} found in this repo. Try a different doc type or use Custom Text mode.`);
    } catch (e) { setLoadError(e.message || "Failed to load repo."); }
    finally { setLoading(false); }
  };

  const translate = async () => {
    const content = mode === "custom" ? customText.trim() : sourceContent;
    if (!content || selectedLangs.length === 0) return;
    setTranslating(true); setGenError(""); setOutputs({}); setLangStatus({});
    try {
      const langs = LANGUAGES.filter(l => selectedLangs.includes(l.code));
      const results = await translateToMultiple(
        content, langs, docType, formality, preserveCode,
        (code, status) => setLangStatus(prev => ({ ...prev, [code]: status }))
      );
      setOutputs(results);
      const firstDone = langs.find(l => results[l.code]);
      if (firstDone) setActiveOutput(firstDone.code);
    } catch (e) { setGenError(e.message || "Translation failed."); }
    finally { setTranslating(false); }
  };

  const doneLangs = LANGUAGES.filter(l => outputs[l.code]);
  const activeOutputLang = LANGUAGES.find(l => l.code === activeOutput);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box}
        @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        input::placeholder,textarea::placeholder{color:#cbd5e1}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}
      `}</style>

      <div style={{ borderBottom: "1px solid #e2e8f0", padding: "15px 26px", display: "flex", alignItems: "center", gap: 12, background: "#fff" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🌍</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>Multi-Language Docs</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Translate documentation into {LANGUAGES.length}+ languages instantly</div>
        </div>
        {doneLangs.length > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {doneLangs.slice(0, 6).map(l => <span key={l.code} style={{ fontSize: 16 }} title={l.name}>{l.flag}</span>)}
            {doneLangs.length > 6 && <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 700 }}>+{doneLangs.length - 6}</span>}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1020, margin: "0 auto", padding: "24px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── Left: config ── */}
          <div>
            {/* Mode toggle */}
            <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 3, marginBottom: 16 }}>
              {[["repo", "📦 From Repo"], ["custom", "✏️ Custom Text"]].map(([m, l]) => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ flex: 1, padding: "7px", borderRadius: 6, border: "none", background: mode === m ? "#fff" : "transparent", color: mode === m ? "#4338ca" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Repo mode */}
            {mode === "repo" && (
              <div style={{ marginBottom: 16, animation: "fadein .2s ease" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>GitHub Repository</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input value={url} onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !loading && loadRepo()}
                    placeholder="github.com/owner/repo"
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 7, background: "#fff", border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    onFocus={e => e.target.style.borderColor = "#6366f1"}
                    onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
                  <button onClick={loadRepo} disabled={loading || !url.trim()}
                    style={{ padding: "8px 11px", borderRadius: 7, border: "none", background: loading || !url.trim() ? "#f1f5f9" : "#6366f1", color: loading || !url.trim() ? "#cbd5e1" : "#fff", fontSize: 11, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {loading ? "…" : "Load"}
                  </button>
                </div>
                {/* Doc type */}
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Document Type</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
                  {Object.values(DOC_TYPES).filter(d => d.id !== "custom").map(d => (
                    <div key={d.id} onClick={() => setDocType(d.id)}
                      style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderRadius: 7, border: `1px solid ${docType === d.id ? "#6366f1" : "#e2e8f0"}`, background: docType === d.id ? "#eef2ff" : "#fff", cursor: "pointer" }}>
                      <span>{d.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: docType === d.id ? "#4338ca" : "#334155" }}>{d.label}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{d.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {loadError && <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 8 }}>⚠ {loadError}</div>}
                {sourceContent && (
                  <div style={{ padding: "8px 10px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                    ✓ {repoMeta?.name} — {sourceContent.length} chars loaded
                  </div>
                )}
              </div>
            )}

            {/* Custom text mode */}
            {mode === "custom" && (
              <div style={{ marginBottom: 16, animation: "fadein .2s ease" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Your Documentation</div>
                <textarea value={customText} onChange={e => setCustomText(e.target.value)} rows={8}
                  placeholder="Paste your README, documentation, or any text here to translate..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 12, fontFamily: "inherit", lineHeight: 1.65, resize: "vertical", outline: "none" }}
                  onFocus={e => e.target.style.borderColor = "#6366f1"}
                  onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
                {customText && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{customText.length} characters</div>}
              </div>
            )}

            {/* Translation options */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Translation Options</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px" }}>
                {/* Formality */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Tone</div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[["formal", "Formal"], ["neutral", "Neutral"], ["casual", "Casual"]].map(([v, l]) => (
                      <button key={v} onClick={() => setFormality(v)}
                        style={{ flex: 1, padding: "5px", borderRadius: 6, border: `1px solid ${formality === v ? "#6366f1" : "#e2e8f0"}`, background: formality === v ? "#eef2ff" : "transparent", color: formality === v ? "#4338ca" : "#64748b", fontSize: 11, fontWeight: formality === v ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Preserve code */}
                <div onClick={() => setPreserveCode(p => !p)}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${preserveCode ? "#6366f1" : "#cbd5e1"}`, background: preserveCode ? "#6366f1" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {preserveCode && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#334155" }}>Preserve code blocks</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>Keep commands & code untranslated</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Language selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Target Languages ({selectedLangs.length})
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={() => setSelectedLangs(LANGUAGES.map(l => l.code))}
                    style={{ fontSize: 10, color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>All</button>
                  <button onClick={() => setSelectedLangs([])}
                    style={{ fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>None</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
                {LANGUAGES.map(l => (
                  <LangCard key={l.code} lang={l} selected={selectedLangs}
                    onToggle={toggleLang} status={langStatus[l.code]} />
                ))}
              </div>
            </div>

            {/* Translate button */}
            <button onClick={translate}
              disabled={translating || selectedLangs.length === 0 || (mode === "repo" ? !sourceContent : !customText.trim())}
              style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: translating || selectedLangs.length === 0 ? "#f1f5f9" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: translating ? "#94a3b8" : selectedLangs.length === 0 ? "#cbd5e1" : "#fff", fontSize: 14, fontWeight: 800, cursor: translating ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>
              {translating
                ? `Translating ${Object.values(langStatus).filter(s => s === "done").length}/${selectedLangs.length}…`
                : `Translate to ${selectedLangs.length} Language${selectedLangs.length !== 1 ? "s" : ""} 🌍`}
            </button>
            {genError && <div style={{ marginTop: 6, color: "#ef4444", fontSize: 11 }}>⚠ {genError}</div>}
          </div>

          {/* ── Right: output ── */}
          <div>
            {doneLangs.length > 0 && (
              <div style={{ animation: "fadein .3s ease" }}>
                {/* Language tabs */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
                  {doneLangs.map(l => (
                    <button key={l.code} onClick={() => setActiveOutput(l.code)}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${activeOutput === l.code ? "#6366f1" : "#e2e8f0"}`, background: activeOutput === l.code ? "#eef2ff" : "#fff", color: activeOutput === l.code ? "#4338ca" : "#64748b", fontSize: 12, fontWeight: activeOutput === l.code ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                      <span style={{ fontSize: 14 }}>{l.flag}</span>
                      <span>{l.nativeName}</span>
                    </button>
                  ))}
                  {/* Download all */}
                  <button onClick={() => {
                    doneLangs.forEach(l => {
                      if (outputs[l.code]) {
                        setTimeout(() => downloadMd(outputs[l.code], `${docType.toUpperCase()}-${l.code}.md`), 200);
                      }
                    });
                  }} style={{ marginLeft: "auto", padding: "6px 11px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    ⬇ All ({doneLangs.length})
                  </button>
                </div>

                {/* Active output */}
                {activeOutputLang && outputs[activeOutputLang.code] && (
                  <TranslationOutput lang={activeOutputLang} content={outputs[activeOutputLang.code]}
                    repoName={repoMeta?.name || "doc"} docType={docType} />
                )}

                {/* Progress for remaining langs */}
                {translating && (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                      Translating {Object.values(langStatus).filter(s => s === "generating").map(s => s).length > 0 ? "…" : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {LANGUAGES.filter(l => selectedLangs.includes(l.code) && !outputs[l.code]).map(l => (
                        <span key={l.code} style={{ fontSize: 13, opacity: langStatus[l.code] === "generating" ? 1 : 0.3, transition: "opacity .3s" }} title={l.name}>{l.flag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!doneLangs.length && !translating && (
              <div style={{ height: 360, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1.5px dashed #e2e8f0", borderRadius: 12, color: "#94a3b8", gap: 12 }}>
                <div style={{ fontSize: 36, display: "flex", gap: 4 }}>🇬🇧 → 🌍</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Load a repo, pick languages, translate</div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", maxWidth: 260, lineHeight: 1.7 }}>
                    Produces natural translations that read like they were written in the target language — not machine-translated.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", maxWidth: 280 }}>
                  {LANGUAGES.slice(0, 10).map(l => <span key={l.code} style={{ fontSize: 18 }} title={l.name}>{l.flag}</span>)}
                  <span style={{ fontSize: 11, color: "#cbd5e1" }}>+{LANGUAGES.length - 10} more</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
