import { useState, useRef } from "react";

// ─── Scoring dimensions ───────────────────────────────────────────────────────
const DIMENSIONS = {
  completeness: { label: "Completeness",  icon: "📋", color: "#6366f1", description: "Has all essential sections" },
  clarity:      { label: "Clarity",       icon: "💡", color: "#0ea5e9", description: "Easy to understand, well-explained" },
  structure:    { label: "Structure",     icon: "🏗️", color: "#8b5cf6", description: "Logical flow, proper headings" },
  grammar:      { label: "Grammar",       icon: "✏️", color: "#10b981", description: "Spelling, grammar, punctuation" },
  technical:    { label: "Technical",     icon: "⚙️", color: "#f59e0b", description: "Accurate, specific instructions" },
  formatting:   { label: "Formatting",    icon: "🎨", color: "#ec4899", description: "Markdown quality, code blocks" },
};

// ─── Claude analysis ──────────────────────────────────────────────────────────
async function analyseDoc(content, docType, audience) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are a technical documentation expert. Analyse documentation and return a structured JSON assessment. Be honest and specific — don't inflate scores. Return ONLY valid JSON.`,
      messages: [{
        role: "user",
        content: `Analyse this ${docType} documentation intended for ${audience}.

DOCUMENT:
${content.slice(0, 3000)}

Return ONLY this JSON structure (no markdown, no backticks, pure JSON):
{
  "overall": <0-100 integer>,
  "scores": {
    "completeness": <0-100>,
    "clarity": <0-100>,
    "structure": <0-100>,
    "grammar": <0-100>,
    "technical": <0-100>,
    "formatting": <0-100>
  },
  "grade": "<A+|A|B+|B|C+|C|D|F>",
  "summary": "<2-3 sentence honest verdict on this doc's overall quality>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "critical_issues": [
    { "issue": "<specific problem>", "fix": "<concrete fix>", "severity": "critical|high|medium|low", "line_hint": "<relevant section or quote if identifiable>" }
  ],
  "missing_sections": ["<section name>", "<section name>"],
  "typos": [
    { "original": "<wrong text>", "suggestion": "<corrected text>", "context": "<surrounding text for location>" }
  ],
  "broken_formatting": ["<description of formatting issue>"],
  "top_improvement": "<single most impactful improvement they should make>"
}`
      }],
    }),
  });
  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  try { return JSON.parse(text.trim()); }
  catch {
    // Try to extract JSON from the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) try { return JSON.parse(match[0]); } catch {}
    return null;
  }
}

async function generateImprovedDoc(content, analysis, docType) {
  const issues = analysis.critical_issues?.slice(0, 5).map(i => `- ${i.issue}: ${i.fix}`).join("\n") || "";
  const missing = analysis.missing_sections?.join(", ") || "none";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are an expert technical writer. Improve documentation based on specific feedback. Return ONLY the improved markdown.",
      messages: [{
        role: "user",
        content: `Improve this ${docType} document based on the analysis findings.

CURRENT DOCUMENT:
${content.slice(0, 2500)}

ISSUES TO FIX:
${issues}

MISSING SECTIONS TO ADD: ${missing}

GRAMMAR/TYPOS TO FIX: ${analysis.typos?.map(t => `"${t.original}" → "${t.suggestion}"`).join(", ") || "none"}

FORMATTING ISSUES: ${analysis.broken_formatting?.join(", ") || "none"}

Produce an improved version that fixes all identified issues, adds missing sections, and raises the quality score. Preserve all correct content. Return ONLY the improved markdown.`
      }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 90, color, label }) {
  const r = (size / 2) - 8;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)" }} />
        <text x={size/2} y={size/2 - 5} textAnchor="middle" fill={color} fontSize={size > 60 ? "20" : "14"} fontWeight="800" fontFamily="'DM Sans',sans-serif">{score}</text>
        <text x={size/2} y={size/2 + 10} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="sans-serif">/ 100</text>
      </svg>
      {label && <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textAlign: "center" }}>{label}</div>}
    </div>
  );
}

const SEVERITY_STYLES = {
  critical: { bg: "#fef2f2", border: "#fecaca", color: "#dc2626", dot: "🔴" },
  high:     { bg: "#fff7ed", border: "#fed7aa", color: "#ea580c", dot: "🟠" },
  medium:   { bg: "#fefce8", border: "#fde68a", color: "#d97706", dot: "🟡" },
  low:      { bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a", dot: "🟢" },
};

function IssueCard({ issue }) {
  const [open, setOpen] = useState(false);
  const s = SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.low;
  return (
    <div style={{ border: `1px solid ${s.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 7 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", background: s.bg, cursor: "pointer" }}>
        <span style={{ fontSize: 12 }}>{s.dot}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: s.color }}>{issue.issue}</span>
        {issue.line_hint && <span style={{ fontSize: 10, color: s.color + "80", fontStyle: "italic", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{issue.line_hint}"</span>}
        <span style={{ color: s.color + "80", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "9px 12px", background: "#fff", borderTop: `1px solid ${s.border}` }}>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>💡 <strong>Fix:</strong> {issue.fix}</div>
        </div>
      )}
    </div>
  );
}

function renderMd(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#{3} (.+)$/gm, "<h3 style='color:#334155;font-size:1em;margin:.6em 0 .25em'>$1</h3>")
    .replace(/^#{2} (.+)$/gm, "<h2 style='color:#1e293b;font-size:1.12em;border-bottom:1px solid #f1f5f9;padding-bottom:.2em;margin:.8em 0 .3em'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style='color:#0f172a;font-size:1.3em;margin:.8em 0 .35em'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#0f172a'>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code style='background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:.82em;color:#7c3aed;font-family:monospace'>$1</code>")
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px 14px;border-radius:7px;overflow-x:auto;margin:.5em 0"><code style="color:#334155;font-size:.84em;font-family:'JetBrains Mono',monospace">${c.trim()}</code></pre>`)
    .replace(/^\s*[-*] (.+)$/gm, "<li style='color:#475569;margin:.25em 0;font-size:13px'>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul style="padding-left:16px;margin:.35em 0">${m}</ul>`)
    .replace(/\n\n+/g, "</p><p style='color:#475569;margin:.4em 0;font-size:13px;line-height:1.75'>")
    .replace(/^(?!<[hpuolridbs]|<hr|<pre)(.+)$/gm, m => m.trim() ? `<p style="color:#475569;margin:.35em 0;font-size:13px;line-height:1.75">${m}</p>` : "");
}

function downloadMd(content, filename) {
  Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/markdown" })),
    download: filename,
  }).click();
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function DocValidator() {
  const [docText, setDocText] = useState("");
  const [docType, setDocType] = useState("README");
  const [audience, setAudience] = useState("developers");
  const [inputMode, setInputMode] = useState("paste"); // "paste" or "upload"
  const fileRef = useRef(null);

  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");

  const [improving, setImproving] = useState(false);
  const [improved, setImproved] = useState(null);
  const [tab, setTab] = useState("scores");
  const [improvedView, setImprovedView] = useState("preview");
  const [copied, setCopied] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setDocText(e.target.result);
    reader.readAsText(file);
  };

  const analyse = async () => {
    if (!docText.trim()) return;
    setAnalysing(true); setAnalysisError(""); setAnalysis(null); setImproved(null);
    try {
      const result = await analyseDoc(docText, docType, audience);
      if (!result) throw new Error("Analysis returned empty result.");
      setAnalysis(result);
      setTab("scores");
    } catch (e) { setAnalysisError(e.message || "Analysis failed."); }
    finally { setAnalysing(false); }
  };

  const improve = async () => {
    if (!analysis || !docText) return;
    setImproving(true); setImproved(null);
    try {
      const md = await generateImprovedDoc(docText, analysis, docType);
      setImproved(md);
      setTab("improved");
    } catch {}
    finally { setImproving(false); }
  };

  const overallColor = analysis
    ? analysis.overall >= 80 ? "#10b981" : analysis.overall >= 60 ? "#f59e0b" : "#ef4444"
    : "#94a3b8";

  const TABS = [
    ["scores", "📊 Scores"],
    ["issues", `⚠️ Issues (${analysis?.critical_issues?.length || 0})`],
    ["typos", `✏️ Grammar (${analysis?.typos?.length || 0})`],
    ["missing", `📋 Missing`],
    ...(improved ? [["improved", "✨ Improved"]] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box}
        @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        textarea::placeholder{color:#cbd5e1}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #e2e8f0", padding: "15px 26px", display: "flex", alignItems: "center", gap: 12, background: "#fff" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#0ea5e9,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📋</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em", color: "#0f172a" }}>Doc Validator</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Score, audit, and improve your documentation</div>
        </div>
        {analysis && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: overallColor, lineHeight: 1 }}>{analysis.overall}</div>
              <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em" }}>overall</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: overallColor }}>{analysis.grade}</div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── Left: input ── */}
          <div>
            {/* Input mode */}
            <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 3, marginBottom: 14 }}>
              {[["paste", "📋 Paste"], ["upload", "📁 Upload"]].map(([m, l]) => (
                <button key={m} onClick={() => setInputMode(m)}
                  style={{ flex: 1, padding: "7px", borderRadius: 6, border: "none", background: inputMode === m ? "#fff" : "transparent", color: inputMode === m ? "#0f172a" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: inputMode === m ? "0 1px 2px rgba(0,0,0,.07)" : "none" }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Doc type + audience */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Doc Type</div>
                <select value={docType} onChange={e => setDocType(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, background: "#fff", border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                  {["README", "API Docs", "Contributing Guide", "Tutorial", "Quick Start", "Architecture Doc", "User Manual", "Release Notes"].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Audience</div>
                <select value={audience} onChange={e => setAudience(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, background: "#fff", border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                  {["developers", "non-technical users", "new contributors", "senior engineers", "product managers", "students"].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Text input */}
            {inputMode === "paste" ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Documentation</div>
                <textarea value={docText} onChange={e => setDocText(e.target.value)} rows={14}
                  placeholder="Paste your README, docs, or any documentation here...

The validator will check for:
• Missing sections
• Grammar & typos
• Broken formatting
• Clarity & completeness"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 12.5, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.65, resize: "vertical", outline: "none" }}
                  onFocus={e => e.target.style.borderColor = "#6366f1"}
                  onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
                {docText && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{docText.length} chars · {docText.split("\n").length} lines</div>}
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <div
                  onClick={() => fileRef.current?.click()}
                  onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                  onDragOver={e => e.preventDefault()}
                  style={{ padding: "32px 20px", borderRadius: 10, border: "2px dashed #e2e8f0", background: "#fff", textAlign: "center", cursor: "pointer", transition: "border-color .2s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#6366f1"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>Drop a .md or .txt file</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>or click to browse</div>
                  <input ref={fileRef} type="file" accept=".md,.txt,.markdown" onChange={e => handleFile(e.target.files[0])} style={{ display: "none" }} />
                </div>
                {docText && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                    ✓ File loaded — {docText.length} chars
                  </div>
                )}
              </div>
            )}

            {/* Analyse button */}
            <button onClick={analyse} disabled={analysing || !docText.trim()}
              style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: analysing || !docText.trim() ? "#f1f5f9" : "linear-gradient(135deg,#0ea5e9,#6366f1)", color: analysing || !docText.trim() ? "#94a3b8" : "#fff", fontSize: 14, fontWeight: 800, cursor: analysing ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "-0.01em", marginBottom: 8 }}>
              {analysing ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #94a3b8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  Analysing…
                </span>
              ) : "Validate Documentation 📋"}
            </button>
            {analysisError && <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 8 }}>⚠ {analysisError}</div>}

            {/* Improve button */}
            {analysis && (
              <button onClick={improve} disabled={improving}
                style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #e2e8f0", background: improving ? "#f8fafc" : "#fff", color: improving ? "#94a3b8" : "#6366f1", fontSize: 13, fontWeight: 700, cursor: improving ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .2s" }}>
                {improving ? "Generating improved version…" : "✨ Generate Improved Version"}
              </button>
            )}
          </div>

          {/* ── Right: results ── */}
          <div>
            {analysis && (
              <div style={{ animation: "fadein .35s ease" }}>
                {/* Score hero */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                    <ScoreRing score={analysis.overall} size={90} color={overallColor} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: overallColor }}>{analysis.grade}</span>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>{docType} · {audience}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.65, marginBottom: 8 }}>{analysis.summary}</div>
                      {analysis.top_improvement && (
                        <div style={{ padding: "8px 12px", background: "#eef2ff", borderRadius: 7, fontSize: 12, color: "#4338ca", fontWeight: 600 }}>
                          🎯 Top priority: {analysis.top_improvement}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Dimension rings */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
                    {Object.entries(DIMENSIONS).map(([key, dim]) => (
                      <ScoreRing key={key} score={analysis.scores?.[key] || 0} size={62} color={dim.color} label={dim.label} />
                    ))}
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 3, marginBottom: 14, background: "#fff", padding: 3, borderRadius: 8, border: "1px solid #e2e8f0", flexWrap: "wrap" }}>
                  {TABS.map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)}
                      style={{ flex: 1, padding: "7px 6px", borderRadius: 6, border: "none", background: tab === id ? "#f1f5f9" : "transparent", color: tab === id ? "#0f172a" : "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Scores tab */}
                {tab === "scores" && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px", animation: "fadein .2s ease" }}>
                    {Object.entries(DIMENSIONS).map(([key, dim]) => {
                      const score = analysis.scores?.[key] || 0;
                      return (
                        <div key={key} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 14 }}>{dim.icon}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{dim.label}</span>
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>{dim.description}</span>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 800, color: dim.color, fontFamily: "'DM Sans',sans-serif" }}>{score}</span>
                          </div>
                          <div style={{ height: 7, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${score}%`, background: dim.color, borderRadius: 4, transition: "width 1s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                    {analysis.strengths?.length > 0 && (
                      <div style={{ marginTop: 14, padding: "10px 12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 6 }}>✓ Strengths</div>
                        {analysis.strengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#16a34a", marginBottom: 3 }}>• {s}</div>)}
                      </div>
                    )}
                  </div>
                )}

                {/* Issues tab */}
                {tab === "issues" && (
                  <div style={{ animation: "fadein .2s ease" }}>
                    {!analysis.critical_issues?.length
                      ? <div style={{ textAlign: "center", padding: 30, color: "#16a34a", fontWeight: 600 }}>✓ No critical issues found</div>
                      : analysis.critical_issues.map((issue, i) => <IssueCard key={i} issue={issue} />)
                    }
                  </div>
                )}

                {/* Grammar/typos tab */}
                {tab === "typos" && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", animation: "fadein .2s ease" }}>
                    {!analysis.typos?.length
                      ? <div style={{ textAlign: "center", padding: 30, color: "#16a34a", fontWeight: 600 }}>✓ No grammar issues detected</div>
                      : analysis.typos.map((t, i) => (
                        <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                              <code style={{ fontSize: 12, padding: "2px 7px", borderRadius: 4, background: "#fff1f2", color: "#e11d48", textDecoration: "line-through", fontFamily: "'JetBrains Mono',monospace" }}>{t.original}</code>
                              <span style={{ color: "#94a3b8", fontSize: 12 }}>→</span>
                              <code style={{ fontSize: 12, padding: "2px 7px", borderRadius: 4, background: "#f0fdf4", color: "#16a34a", fontFamily: "'JetBrains Mono',monospace" }}>{t.suggestion}</code>
                            </div>
                            {t.context && <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>…{t.context}…</div>}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* Missing sections tab */}
                {tab === "missing" && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", animation: "fadein .2s ease" }}>
                    {!analysis.missing_sections?.length && !analysis.broken_formatting?.length
                      ? <div style={{ textAlign: "center", padding: 20, color: "#16a34a", fontWeight: 600 }}>✓ No missing sections or formatting issues</div>
                      : <>
                        {analysis.missing_sections?.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Missing Sections</div>
                            {analysis.missing_sections.map((s, i) => (
                              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                                <span style={{ fontSize: 12, color: "#f59e0b" }}>⚠</span>
                                <span style={{ fontSize: 12, color: "#475569" }}>{s}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {analysis.broken_formatting?.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Formatting Issues</div>
                            {analysis.broken_formatting.map((f, i) => (
                              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                                <span style={{ fontSize: 12, color: "#6366f1" }}>🎨</span>
                                <span style={{ fontSize: 12, color: "#475569" }}>{f}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    }
                  </div>
                )}

                {/* Improved doc tab */}
                {tab === "improved" && improved && (
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", animation: "fadein .2s ease" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>✨ Improved {docType}</span>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: "flex", background: "#e2e8f0", borderRadius: 5, overflow: "hidden" }}>
                        {["preview", "raw"].map(v => (
                          <button key={v} onClick={() => setImprovedView(v)} style={{ padding: "3px 9px", border: "none", background: improvedView === v ? "#fff" : "transparent", color: improvedView === v ? "#0f172a" : "#94a3b8", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            {v === "preview" ? "👁" : "⌨"}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(improved); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid #e2e8f0", background: copied ? "#f0fdf4" : "#fff", color: copied ? "#16a34a" : "#64748b", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        {copied ? "✓" : "Copy"}
                      </button>
                      <button onClick={() => downloadMd(improved, `${docType.replace(/\s/g,"-")}-improved.md`)}
                        style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        ⬇ .md
                      </button>
                    </div>
                    <div style={{ maxHeight: 480, overflowY: "auto", background: "#fff" }}>
                      {improvedView === "raw"
                        ? <pre style={{ margin: 0, padding: 14, fontSize: 12, lineHeight: 1.75, color: "#475569", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'JetBrains Mono',monospace" }}>{improved}</pre>
                        : <div style={{ padding: "18px 22px" }} dangerouslySetInnerHTML={{ __html: renderMd(improved) }} />
                      }
                    </div>
                  </div>
                )}
              </div>
            )}

            {!analysis && !analysing && (
              <div style={{ height: 420, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1.5px dashed #e2e8f0", borderRadius: 12, color: "#94a3b8", gap: 14, background: "#fff" }}>
                <div style={{ fontSize: 42 }}>📋</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#334155", fontWeight: 700, marginBottom: 6 }}>Documentation Audit</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", maxWidth: 280, lineHeight: 1.75 }}>
                    Paste your docs on the left and get a full quality report — scores, issues, typos, and an AI-improved version.
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, maxWidth: 340 }}>
                  {Object.values(DIMENSIONS).map(d => (
                    <div key={d.label} style={{ padding: "8px 10px", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 16, marginBottom: 2 }}>{d.icon}</div>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{d.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
