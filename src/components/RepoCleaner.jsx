import { useState, useCallback } from "react";

const GITHUB_RAW = "https://raw.githubusercontent.com";
const GITHUB_API = "https://api.github.com";

function parseGitHubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

async function fetchRepoData(owner, repo) {
  const [repoRes, treeRes, languagesRes] = await Promise.all([
    fetch(`${GITHUB_API}/repos/${owner}/${repo}`),
    fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`),
    fetch(`${GITHUB_API}/repos/${owner}/${repo}/languages`),
  ]);
  if (!repoRes.ok) throw new Error("Repo not found or is private.");
  const repoData = await repoRes.json();
  const treeData = treeRes.ok ? await treeRes.json() : { tree: [] };
  const languages = languagesRes.ok ? await languagesRes.json() : {};
  return { repoData, tree: treeData.tree || [], languages };
}

async function fetchFileContent(owner, repo, path, branch = "main") {
  for (const b of [branch, "master", "main"]) {
    try {
      const res = await fetch(`${GITHUB_RAW}/${owner}/${repo}/${b}/${path}`);
      if (res.ok) return await res.text();
    } catch {}
  }
  return null;
}

function detectMissing(tree) {
  const files = tree.map((f) => f.path?.toLowerCase() || "");
  return {
    readme: !files.some((f) => f === "readme.md" || f === "readme.txt" || f === "readme"),
    license: !files.some((f) => f.startsWith("license")),
    gitignore: !files.some((f) => f === ".gitignore"),
    contributing: !files.some((f) => f.startsWith("contributing")),
    envExample: !files.some((f) => f.includes(".env.example")),
  };
}

function buildRepoContext(repoData, tree, languages) {
  const filePaths = tree.map((f) => f.path).filter(Boolean).slice(0, 60);
  const folders = [...new Set(filePaths.map((p) => p.split("/")[0]))].slice(0, 12);
  return {
    name: repoData.name,
    description: repoData.description || "",
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    language: Object.keys(languages)[0] || "Unknown",
    languages: Object.keys(languages).slice(0, 5),
    topics: repoData.topics || [],
    defaultBranch: repoData.default_branch || "main",
    filePaths, folders,
    missing: detectMissing(tree),
    homepage: repoData.homepage || "",
    owner: repoData.owner?.login || "",
  };
}

async function callClaude(messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.find((b) => b.type === "text")?.text || "";
}

async function generateReadme(ctx, code, opts) {
  const prompt = `Generate a complete README.md for this GitHub repo.

Repo: ${ctx.owner}/${ctx.name}
Description: ${ctx.description || "Infer from structure"}
Language: ${ctx.language} | Also: ${ctx.languages.join(", ")}
Topics: ${ctx.topics.join(", ") || "none"}
Stars: ${ctx.stars} | Forks: ${ctx.forks}
Folders: ${ctx.folders.join(", ")}
Files (sample):
${ctx.filePaths.slice(0, 28).join("\n")}
${code ? `\nCode context:\n\`\`\`\n${code.slice(0, 700)}\n\`\`\`` : ""}

Sections to include:
1. Project title + tagline
${opts.badges ? "2. Badges row (shields.io: language, license, stars)" : ""}
3. About (2-3 sentences inferred from structure)
4. Features (bullets inferred from files/folders)
5. Tech Stack
6. Getting Started — Prerequisites + Installation${opts.detailedInstall ? " (very detailed, include troubleshooting)" : ""}
7. Usage${opts.codeExamples ? " with a real code snippet" : ""}
8. Folder Structure (tree)
${opts.contributing ? "9. Contributing" : ""}
${opts.license ? "10. License" : ""}

No placeholder text. Be specific. Return ONLY the raw markdown.`;
  return callClaude([{ role: "user", content: prompt }],
    "You are an expert technical writer. Return ONLY raw markdown, nothing else.");
}

async function generateQuickStart(ctx) {
  return callClaude([{ role: "user", content:
    `Write a concise quick-start guide for ${ctx.owner}/${ctx.name} (${ctx.language}).
Folders: ${ctx.folders.join(", ")}
Files: ${ctx.filePaths.slice(0, 18).join(", ")}
Include: clone, install, env setup, run. Under 30 lines. Return ONLY markdown.`
  }], "You are a developer experience expert. Return ONLY raw markdown.");
}

async function generateWikiHome(ctx) {
  return callClaude([{ role: "user", content:
    `Create a GitHub Wiki Home page for ${ctx.owner}/${ctx.name}.
Language: ${ctx.language}, Folders: ${ctx.folders.join(", ")}
Sections: Overview, Navigation links, Architecture overview, FAQ. Return ONLY markdown.`
  }], "You are a technical documentation expert. Return ONLY raw markdown.");
}

async function suggestLicense(ctx) {
  const text = await callClaude([{ role: "user", content:
    `Suggest the best license for: ${ctx.name}, ${ctx.language}, topics: ${ctx.topics.join(", ")}.
Return JSON only: {"license":"MIT|Apache2|GPL3|BSD2|ISC","reason":"2-3 sentences"}`
  }], "You are a software licensing expert. Return ONLY a valid JSON object.");
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return { license: "MIT", reason: "MIT is the most permissive and widely-used license." }; }
}

// ─── Markdown preview renderer ────────────────────────────────────────────────
function renderMd(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#{6} (.+)$/gm, "<h6>$1</h6>")
    .replace(/^#{5} (.+)$/gm, "<h5>$1</h5>")
    .replace(/^#{4} (.+)$/gm, "<h4>$1</h4>")
    .replace(/^#{3} (.+)$/gm, "<h3>$1</h3>")
    .replace(/^#{2} (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%;border-radius:4px" onerror="this.style.display=\'none\'">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#58a6ff;text-decoration:none">$1</a>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`)
    .replace(/^---$/gm, "<hr>")
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/^(?!<[hpuolprei]|<hr)(.+)$/gm, (m) => m.trim() ? m : "");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}

function openEmail(repoName, content) {
  const sub = encodeURIComponent(`README for ${repoName}`);
  const body = encodeURIComponent(content.slice(0, 1600) + "\n\n[Full file available via download]");
  window.open(`mailto:?subject=${sub}&body=${body}`);
}

// ─── UI ───────────────────────────────────────────────────────────────────────
const C = {
  bg: "#010409", surf: "#0d1117", surf2: "#161b22", border: "#21262d",
  text: "#e6edf3", muted: "#64748b", sub: "#475569",
  blue: "#2563eb", purple: "#7c3aed", green: "#16a34a",
  greenLit: "#86efac", orange: "#f97316", red: "#ef4444",
};

function Chip({ label, color = C.blue }) {
  return (
    <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", background: color + "22", color, border: `1px solid ${color}33` }}>
      {label}
    </span>
  );
}

function Toggle({ label, sub, on, toggle }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", padding: "7px 0" }}>
      <div onClick={toggle} style={{ width: 34, height: 19, borderRadius: 10, flexShrink: 0, marginTop: 2, background: on ? C.blue : "#1e293b", border: `1px solid ${on ? C.blue : "#334155"}`, position: "relative", transition: "all .2s", cursor: "pointer" }}>
        <div style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 13, height: 13, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{sub}</div>}
      </div>
    </label>
  );
}

function ActionBar({ content, filename, repoName, view, setView }) {
  const [copied, setCopied] = useState(false);
  const [emailed, setEmailed] = useState(false);

  const btnStyle = (active, ac) => ({
    display: "flex", alignItems: "center", gap: 5,
    padding: "6px 12px", borderRadius: 7, border: "1px solid " + (active ? ac + "55" : C.border),
    background: active ? ac + "15" : C.surf, color: active ? ac : C.muted,
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .18s",
  });

  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {/* Raw / Preview toggle */}
      <div style={{ display: "flex", background: C.bg, border: "1px solid " + C.border, borderRadius: 7, overflow: "hidden" }}>
        {["raw", "preview"].map(v => (
          <button key={v} onClick={() => setView(v)} style={{ ...btnStyle(view === v, C.blue), border: "none", borderRadius: 0 }}>
            {v === "raw" ? "⌨ Raw" : "👁 Preview"}
          </button>
        ))}
      </div>

      <button onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        style={btnStyle(copied, C.green)}>{copied ? "✓ Copied!" : "⎘ Copy"}</button>

      <button onClick={() => downloadFile(content, filename)}
        style={btnStyle(false, C.blue)}>⬇ {filename}</button>

      <button onClick={() => { openEmail(repoName, content); setEmailed(true); setTimeout(() => setEmailed(false), 3000); }}
        style={btnStyle(emailed, C.purple)}>{emailed ? "✉ Opening…" : "✉ Email"}</button>
    </div>
  );
}

function OutputPanel({ title, content, filename, repoName }) {
  const [view, setView] = useState("raw");
  return (
    <div style={{ background: C.surf, border: "1px solid " + C.border, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 15px", borderBottom: "1px solid " + C.border, background: C.surf2, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{title}</span>
        <ActionBar content={content} filename={filename} repoName={repoName} view={view} setView={setView} />
      </div>
      {view === "raw"
        ? <pre style={{ margin: 0, padding: 16, overflowX: "auto", fontSize: 12, lineHeight: 1.75, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 430, overflowY: "auto", fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>{content}</pre>
        : <div style={{ padding: "18px 22px", maxHeight: 430, overflowY: "auto", color: C.text, fontSize: 13.5, lineHeight: 1.85 }} dangerouslySetInnerHTML={{ __html: renderMd(content) }} />
      }
    </div>
  );
}

function MissingAlert({ missing, lic }) {
  const items = [
    missing.readme && { icon: "📄", label: "README.md missing", color: C.orange },
    missing.license && { icon: "⚖️", label: "LICENSE missing", color: C.red, sub: lic ? `Suggested: ${lic.license} — ${lic.reason}` : "" },
    missing.gitignore && { icon: "🚫", label: ".gitignore missing", color: "#eab308" },
    missing.contributing && { icon: "🤝", label: "CONTRIBUTING.md missing", color: C.purple },
    missing.envExample && { icon: "🔐", label: ".env.example missing", color: "#06b6d4" },
  ].filter(Boolean);

  if (!items.length) return (
    <div style={{ padding: "10px 15px", background: "#052e16", border: "1px solid " + C.green + "44", borderRadius: 9, color: C.greenLit, fontSize: 13, marginBottom: 14 }}>
      ✅ All essential files found — nice repo!
    </div>
  );
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.1em" }}>⚠ Missing Files</div>
      {items.map((it, i) => (
        <div key={i} style={{ padding: "9px 13px", background: it.color + "10", border: `1px solid ${it.color}30`, borderRadius: 8, marginBottom: 5 }}>
          <div style={{ color: it.color, fontWeight: 600, fontSize: 13 }}>{it.icon} {it.label}</div>
          {it.sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function Step({ label, done, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0" }}>
      <div style={{ width: 17, height: 17, borderRadius: "50%", flexShrink: 0, background: done ? C.green : active ? C.blue : "#1e293b", border: `2px solid ${done ? C.green : active ? "#3b82f6" : "#334155"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, transition: "all .3s" }}>
        {done ? "✓" : active ? <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#93c5fd", animation: "pulse 1s infinite" }} /> : ""}
      </div>
      <span style={{ fontSize: 12, color: done ? C.greenLit : active ? "#93c5fd" : C.sub }}>{label}</span>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function RepoPolish() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState([]);
  const [cur, setCur] = useState(-1);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState("readme");
  const [opts, setOpts] = useState({ badges: true, codeExamples: true, detailedInstall: false, contributing: true, license: true, quickstart: true, wiki: true });
  const tog = k => setOpts(o => ({ ...o, [k]: !o[k] }));

  const STEPS = ["Fetch repo metadata", "Scan file structure", "Sample source code", "Generate README.md", opts.quickstart && "Generate Quick Start", opts.wiki && "Generate Wiki Home", "Suggest license"].filter(Boolean);

  const run = useCallback(async () => {
    const parsed = parseGitHubUrl(url.trim());
    if (!parsed) { setError("Enter a valid GitHub repo URL."); return; }
    setError(""); setResults(null); setLoading(true); setDone([]); setCur(0);
    let idx = 0;
    const adv = () => { setDone(d => [...d, idx]); idx++; setCur(idx); };

    try {
      const { repoData, tree, languages } = await fetchRepoData(parsed.owner, parsed.repo); adv();
      const ctx = buildRepoContext(repoData, tree, languages); adv();
      const sf = tree.find(f => f.path?.match(/\.(py|js|ts|rb|go|java|rs|cpp|cs)$/) && !f.path.includes("test"));
      const code = sf ? await fetchFileContent(parsed.owner, parsed.repo, sf.path, ctx.defaultBranch) : null; adv();
      const readme = await generateReadme(ctx, code, opts); adv();
      let quickstart = null;
      if (opts.quickstart) { quickstart = await generateQuickStart(ctx); adv(); }
      let wiki = null;
      if (opts.wiki) { wiki = await generateWikiHome(ctx); adv(); }
      const lic = await suggestLicense(ctx); adv();
      setCur(-1);
      setResults({ readme, quickstart, wiki, ctx, missing: ctx.missing, lic });
      setTab("readme");
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [url, opts]);

  const tabs = [
    { id: "readme", label: "README.md", icon: "📄", show: true },
    { id: "quickstart", label: "Quick Start", icon: "⚡", show: opts.quickstart },
    { id: "wiki", label: "Wiki Home", icon: "📚", show: opts.wiki },
  ].filter(t => t.show);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes fadein{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
        input::placeholder{color:${C.sub}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${C.surf}}
        ::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
        h1,h2{border-bottom:1px solid ${C.border};padding-bottom:.25em;margin:.7em 0 .3em;color:${C.text};line-height:1.3}
        h1{font-size:1.45em}h2{font-size:1.2em}
        h3,h4{color:${C.text};margin:.6em 0 .25em}
        code{background:${C.surf2};padding:2px 5px;border-radius:4px;font-size:.83em;color:#f97316}
        pre{background:${C.surf2};padding:12px;border-radius:8px;overflow-x:auto;margin:.6em 0}
        pre code{background:none;padding:0;color:${C.text};font-size:.9em}
        ul,ol{padding-left:18px}li{margin:.2em 0;color:${C.text}}
        p{margin:.4em 0;color:${C.text}}
        hr{border:none;border-top:1px solid ${C.border};margin:.8em 0}
        a{color:#58a6ff}strong{color:${C.text}}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid " + C.border, padding: "15px 26px", display: "flex", alignItems: "center", gap: 11, background: C.surf, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ width: 33, height: 33, borderRadius: 9, background: "linear-gradient(135deg,#2563eb,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✨</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>RepoPolish</div>
          <div style={{ fontSize: 11, color: C.muted }}>AI-powered GitHub README generator</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
          <Chip label="Claude Sonnet" color={C.purple} />
          <Chip label="GitHub API" color={C.blue} />
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "26px 18px" }}>

        {/* Input row + options */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 230px", gap: 18, marginBottom: 26, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>GitHub Repository URL</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && run()}
                placeholder="https://github.com/username/repo"
                style={{ flex: 1, padding: "10px 13px", borderRadius: 9, background: C.surf, border: "1px solid " + C.border, color: C.text, fontSize: 13.5, fontFamily: "inherit", outline: "none", transition: "border-color .2s" }}
                onFocus={e => e.target.style.borderColor = C.blue}
                onBlur={e => e.target.style.borderColor = C.border}
              />
              <button onClick={run} disabled={loading || !url.trim()} style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: loading || !url.trim() ? "#1e293b" : "linear-gradient(135deg,#2563eb,#7c3aed)", color: loading || !url.trim() ? C.sub : "#fff", fontSize: 13.5, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {loading ? "Running…" : "✨ Clean Repo"}
              </button>
            </div>
            {error && <div style={{ marginTop: 6, color: "#f87171", fontSize: 12 }}>⚠ {error}</div>}

            {/* Example links */}
            {!results && !loading && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: C.sub }}>Try:</span>
                {["facebook/react", "tiangolo/fastapi", "vercel/next.js"].map(eg => (
                  <button key={eg} onClick={() => setUrl(`https://github.com/${eg}`)} style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid " + C.border, background: C.surf, color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{eg}</button>
                ))}
              </div>
            )}
          </div>

          {/* Options */}
          <div style={{ background: C.surf, border: "1px solid " + C.border, borderRadius: 10, padding: "11px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Options</div>
            <Toggle label="Badges row" sub="shields.io badges" on={opts.badges} toggle={() => tog("badges")} />
            <Toggle label="Code examples" sub="Real usage snippets" on={opts.codeExamples} toggle={() => tog("codeExamples")} />
            <Toggle label="Detailed install" sub="Verbose + troubleshooting" on={opts.detailedInstall} toggle={() => tog("detailedInstall")} />
            <Toggle label="Contributing section" on={opts.contributing} toggle={() => tog("contributing")} />
            <Toggle label="License section" on={opts.license} toggle={() => tog("license")} />
            <div style={{ borderTop: "1px solid " + C.border, marginTop: 5, paddingTop: 5 }}>
              <Toggle label="Quick Start guide" sub="Separate QUICKSTART.md" on={opts.quickstart} toggle={() => tog("quickstart")} />
              <Toggle label="Wiki Home page" sub="GitHub Wiki content" on={opts.wiki} toggle={() => tog("wiki")} />
            </div>
          </div>
        </div>

        {/* Progress */}
        {loading && (
          <div style={{ background: C.surf, border: "1px solid " + C.border, borderRadius: 11, padding: "15px 18px", marginBottom: 22, animation: "fadein .3s ease" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 9, textTransform: "uppercase", letterSpacing: "0.08em" }}>Progress</div>
            {STEPS.map((s, i) => <Step key={i} label={s} done={done.includes(i)} active={cur === i} />)}
          </div>
        )}

        {/* Results */}
        {results && (
          <div style={{ animation: "fadein .35s ease" }}>
            {/* Summary */}
            <div style={{ background: C.surf, border: "1px solid " + C.border, borderRadius: 11, padding: "13px 16px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{results.ctx.owner}/{results.ctx.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>⭐ {results.ctx.stars} · 🍴 {results.ctx.forks} · 🌿 {results.ctx.defaultBranch}</div>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginLeft: "auto" }}>
                {results.ctx.languages.map(l => <Chip key={l} label={l} color={C.blue} />)}
                {results.ctx.topics.slice(0, 3).map(t => <Chip key={t} label={t} color={C.purple} />)}
              </div>
            </div>

            <MissingAlert missing={results.missing} lic={results.lic} />

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, marginBottom: 12, background: C.surf, borderRadius: 9, padding: 3, border: "1px solid " + C.border }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: "none", background: tab === t.id ? C.surf2 : "transparent", color: tab === t.id ? C.text : C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {tab === "readme" && results.readme && <OutputPanel title="📄 README.md" content={results.readme} filename="README.md" repoName={results.ctx.name} />}
            {tab === "quickstart" && results.quickstart && <OutputPanel title="⚡ QUICKSTART.md" content={results.quickstart} filename="QUICKSTART.md" repoName={results.ctx.name} />}
            {tab === "wiki" && results.wiki && <OutputPanel title="📚 Wiki — Home.md" content={results.wiki} filename="Home.md" repoName={results.ctx.name} />}

            {/* Next steps */}
            <div style={{ background: C.surf, border: "1px solid " + C.border, borderRadius: 11, padding: "13px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 9, textTransform: "uppercase", letterSpacing: "0.08em" }}>📋 Next Steps</div>
              {[
                { icon: "📄", text: "Download README.md → drag into your repo root on GitHub, or: git add README.md && git commit -m 'Add README' && git push" },
                opts.quickstart && { icon: "⚡", text: "Download QUICKSTART.md → add to repo root, or fold into README under Getting Started" },
                opts.wiki && { icon: "📚", text: "Wiki Home: repo → Wiki tab → Create first page → name it 'Home' → paste & save" },
                results.missing.license && { icon: "⚖️", text: `License: repo → Add file → Create new file → name LICENSE → GitHub shows a template picker → choose ${results.lic?.license}` },
                results.missing.gitignore && { icon: "🚫", text: "Add .gitignore: visit gitignore.io → enter your stack → copy into .gitignore" },
              ].filter(Boolean).map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 9, fontSize: 12, color: C.muted, lineHeight: 1.65, marginBottom: 6 }}>
                  <span style={{ flexShrink: 0 }}>{s.icon}</span><span>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !results && !error && (
          <div style={{ textAlign: "center", padding: "52px 0", color: C.sub }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.muted, marginBottom: 5 }}>Paste a public GitHub URL above</div>
            <div style={{ fontSize: 12, maxWidth: 400, margin: "0 auto", lineHeight: 1.75 }}>
              RepoPolish scans your file structure and auto-generates a professional README, Quick Start guide, and Wiki page in seconds.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
