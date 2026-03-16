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

// ─── Stack detection ──────────────────────────────────────────────────────────
async function detectStack(owner, repo) {
  const [meta, tree, langs] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}`),
    ghFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`),
    ghFetch(`/repos/${owner}/${repo}/languages`),
  ]);
  if (!meta) throw new Error("Repo not found or is private.");

  const branch = meta.default_branch || "main";
  const files = (tree?.tree || []).map(f => f.path);
  const lower = files.map(f => f.toLowerCase());

  // Detect runtime/framework
  const detect = (patterns) => patterns.some(p => lower.some(f => typeof p === "string" ? f === p : p.test(f)));

  const stacks = {
    nodejs: detect(["package.json"]),
    python: detect(["requirements.txt", "pyproject.toml", "setup.py", "pipfile"]),
    ruby: detect(["gemfile"]),
    go: detect(["go.mod"]),
    rust: detect(["cargo.toml"]),
    java: detect(["pom.xml", /build\.gradle/]),
    php: detect(["composer.json"]),
    dotnet: detect([/\.csproj$/, /\.sln$/]),
    docker: detect(["dockerfile", "docker-compose.yml", "docker-compose.yaml"]),
  };

  const primaryStack = Object.keys(stacks).find(k => stacks[k]) || "unknown";

  // Detect frameworks
  const frameworks = {
    react: detect([/react/]) && detect(["package.json"]),
    nextjs: detect([/next\.config/]),
    vue: detect([/vue\.config/]),
    angular: detect([/angular\.json/]),
    express: detect(["app.js", "server.js", "index.js"]) && stacks.nodejs,
    fastapi: detect([/main\.py/]) && stacks.python,
    django: detect(["manage.py"]),
    flask: detect([/app\.py/, /wsgi\.py/]) && stacks.python,
    rails: detect(["gemfile"]) && stacks.ruby,
    spring: detect(["pom.xml"]) && stacks.java,
    laravel: detect([/artisan/]) && stacks.php,
    svelte: detect([/svelte\.config/]),
  };
  const framework = Object.keys(frameworks).find(k => frameworks[k]) || null;

  // Entry point detection
  const entryPoints = {
    nodejs: files.find(f => ["src/index.js", "src/index.ts", "index.js", "server.js", "app.js", "src/main.js", "src/main.ts"].includes(f.toLowerCase())),
    python: files.find(f => ["main.py", "app.py", "manage.py", "run.py", "src/main.py"].includes(f.toLowerCase())),
    go: files.find(f => f.toLowerCase() === "main.go" || f.toLowerCase() === "cmd/main.go"),
    rust: files.find(f => f.toLowerCase() === "src/main.rs"),
    ruby: files.find(f => ["app.rb", "config.ru", "server.rb"].includes(f.toLowerCase())),
  };
  const entryPoint = entryPoints[primaryStack] || null;

  // Fetch key files for more context
  const configFiles = ["package.json", "requirements.txt", "go.mod", "cargo.toml", ".env.example", "Makefile", "docker-compose.yml"];
  const fetched = await Promise.all(
    configFiles.map(async f => {
      const c = await tryRaw(owner, repo, f, branch);
      return c ? { file: f, content: c.slice(0, 600) } : null;
    })
  );

  // Parse package.json scripts
  let scripts = {};
  const pkgFile = fetched.find(f => f?.file === "package.json");
  if (pkgFile) {
    try { scripts = JSON.parse(pkgFile.content).scripts || {}; } catch {}
  }

  // Detect database
  const hasDb = lower.some(f => /postgres|mysql|mongo|sqlite|prisma|sequelize|typeorm|knex/.test(f)) ||
    fetched.some(f => f?.content && /postgres|mysql|mongodb|sqlite|database_url/i.test(f.content));

  // Detect env requirements
  const envFile = fetched.find(f => f?.file === ".env.example");
  const envVars = envFile
    ? envFile.content.split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => l.split("=")[0].trim()).filter(Boolean).slice(0, 15)
    : [];

  // Detect port
  const portMatch = fetched
    .filter(Boolean)
    .map(f => f.content)
    .join("\n")
    .match(/port[:\s=]+(\d{4,5})/i);
  const port = portMatch ? portMatch[1] : null;

  return {
    owner, name: meta.name,
    description: meta.description || "",
    language: Object.keys(langs || {})[0] || "Unknown",
    homepage: meta.homepage || "",
    primaryStack, framework, entryPoint,
    stacks, scripts, envVars, hasDb, port, branch,
    hasMakefile: detect(["makefile"]),
    hasDocker: stacks.docker,
    files: files.slice(0, 60),
    fetchedFiles: fetched.filter(Boolean),
  };
}

// ─── Claude generation ────────────────────────────────────────────────────────
async function generateInstallGuide(ctx, audience) {
  const scriptList = Object.entries(ctx.scripts).map(([k, v]) => `  "${k}": "${v}"`).join("\n");
  const configSnippets = ctx.fetchedFiles.map(f => `--- ${f.file} ---\n${f.content}`).join("\n\n");

  const audienceInstructions = {
    dev: "Write for a developer who knows their way around a terminal. Terse, command-focused.",
    nondev: "Write for a non-technical person who has never used a terminal. Explain every step. Define jargon. Be encouraging. Assume nothing.",
    both: "Write two sections: one for developers (quick start) and one for non-developers (detailed walkthrough with explanations).",
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are a developer experience expert. Write install guides that actually work. Return ONLY raw markdown.",
      messages: [{
        role: "user", content: `Generate a complete install and run guide for ${ctx.owner}/${ctx.name}.

DETECTED STACK:
- Primary: ${ctx.primaryStack}
- Framework: ${ctx.framework || "none"}
- Entry point: ${ctx.entryPoint || "unknown"}
- Has Docker: ${ctx.hasDocker}
- Has Makefile: ${ctx.hasMakefile}
- Has database: ${ctx.hasDb}
- Port: ${ctx.port || "unknown"}
- Homepage: ${ctx.homepage || "none"}

ENV VARIABLES REQUIRED: ${ctx.envVars.length > 0 ? ctx.envVars.join(", ") : "none detected"}

PACKAGE SCRIPTS:
${scriptList || "none"}

CONFIG FILE CONTENTS:
${configSnippets}

AUDIENCE: ${audienceInstructions[audience]}

GENERATE:
1. "One-Line Install" — a single curl/git command to clone+install
2. "Prerequisites" — what must be installed first (Node version, Python, Docker, etc.) — be specific about versions where detectable
3. "Setup" — step-by-step: clone, install deps, configure env, seed DB if needed
4. "Run" — exact command to start the project, with expected output
5. "Verify it's working" — what URL to visit, what to expect to see
6. "Common Issues" — 2-3 frequent setup problems for this stack and how to fix them
${ctx.hasDocker ? "7. 'Docker Alternative' — how to run with Docker if available" : ""}

Use actual commands for ${ctx.primaryStack}. Use real script names from the package scripts above.
Every code block must be copy-pasteable and correct.`
      }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

async function generateOneLiner(ctx) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You generate single-line shell commands. Return ONLY a JSON object with keys: clone, install, run, combined. No explanation.",
      messages: [{
        role: "user", content: `Generate one-liner commands for ${ctx.owner}/${ctx.name}.
Stack: ${ctx.primaryStack}, Framework: ${ctx.framework || "none"}, Entry: ${ctx.entryPoint || "unknown"}
Scripts: ${JSON.stringify(ctx.scripts)}
Has Docker: ${ctx.hasDocker}
Return JSON only: { "clone": "...", "install": "...", "run": "...", "combined": "one command to clone+install+run" }`
      }],
    }),
  });
  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return {}; }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderMd(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#{3} (.+)$/gm, "<h3 style='color:#a7f3d0;font-size:1em;margin:.65em 0 .25em;font-family:\"JetBrains Mono\",monospace'>$1</h3>")
    .replace(/^#{2} (.+)$/gm, "<h2 style='color:#6ee7b7;font-size:1.1em;border-bottom:1px solid #064e3b;padding-bottom:.2em;margin:.8em 0 .3em'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style='color:#34d399;font-size:1.3em;margin:.8em 0 .3em'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#a7f3d0'>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code style='background:#022c22;padding:1px 6px;border-radius:4px;font-size:.85em;color:#34d399;font-family:\"JetBrains Mono\",monospace'>$1</code>")
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre style="background:#011a14;border:1px solid #064e3b;padding:14px 16px;border-radius:8px;overflow-x:auto;margin:.6em 0;position:relative"><code style="color:#6ee7b7;font-size:.85em;font-family:'JetBrains Mono',monospace">${c.trim()}</code></pre>`)
    .replace(/^\s*[-*] (.+)$/gm, "<li style='color:#6ee7b7;margin:.25em 0;font-size:13px'>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul style="padding-left:16px;margin:.35em 0">${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, "<li style='color:#6ee7b7;margin:.25em 0;font-size:13px'>$1</li>")
    .replace(/\n\n+/g, "</p><p style='color:#6ee7b7;margin:.4em 0;font-size:13px;line-height:1.75'>")
    .replace(/^(?!<[hpuolridbs]|<hr|<pre)(.+)$/gm, m => m.trim() ? `<p style="color:#6ee7b7;margin:.35em 0;font-size:13px;line-height:1.75">${m}</p>` : "");
}

function CopyCmd({ cmd, label }) {
  const [copied, setCopied] = useState(false);
  if (!cmd) return null;
  return (
    <div style={{ background: "#011a14", border: "1px solid #064e3b", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#022c22", borderBottom: "1px solid #064e3b" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: "0.1em", flex: 1 }}>$ {label}</span>
        <button onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid #064e3b", background: copied ? "#022c22" : "transparent", color: copied ? "#34d399" : "#059669", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: "10px 14px", fontSize: 12.5, color: "#34d399", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 }}>{cmd}</pre>
    </div>
  );
}

function StackBadge({ label, active, color }) {
  return (
    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 8, background: active ? color + "20" : "#011a14", color: active ? color : "#064e3b", border: `1px solid ${active ? color + "50" : "#022c22"}`, fontWeight: active ? 700 : 400, transition: "all .2s" }}>
      {label}
    </span>
  );
}

export default function QuickInstall() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [scanError, setScanError] = useState("");
  const [ctx, setCtx] = useState(null);

  const [audience, setAudience] = useState("both");
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState(null);
  const [oneLiners, setOneLiners] = useState(null);
  const [genError, setGenError] = useState("");
  const [view, setView] = useState("preview");
  const [copied, setCopied] = useState(false);

  const MSGS = ["Reading package files…", "Detecting runtime…", "Finding entry point…", "Parsing dependencies…", "Checking Docker/Makefile…"];

  const scan = async () => {
    const parsed = parseUrl(url.trim());
    if (!parsed) { setScanError("Enter a valid GitHub URL."); return; }
    setScanError(""); setCtx(null); setOutput(null); setOneLiners(null); setScanning(true);
    let mi = 0; setScanMsg(MSGS[0]);
    const iv = setInterval(() => { mi = Math.min(mi + 1, MSGS.length - 1); setScanMsg(MSGS[mi]); }, 800);
    try { setCtx(await detectStack(parsed.owner, parsed.repo)); }
    catch (e) { setScanError(e.message || "Scan failed."); }
    finally { clearInterval(iv); setScanning(false); }
  };

  const generate = async () => {
    if (!ctx) return;
    setGenerating(true); setGenError(""); setOutput(null); setOneLiners(null);
    try {
      const [guide, liners] = await Promise.all([
        generateInstallGuide(ctx, audience),
        generateOneLiner(ctx),
      ]);
      setOutput(guide);
      setOneLiners(liners);
    } catch (e) { setGenError(e.message || "Generation failed."); }
    finally { setGenerating(false); }
  };

  const STACK_COLORS = { nodejs: "#84cc16", python: "#3b82f6", ruby: "#ef4444", go: "#06b6d4", rust: "#f97316", java: "#eab308", php: "#8b5cf6", dotnet: "#a78bfa", docker: "#60a5fa" };

  return (
    <div style={{ minHeight: "100vh", background: "#011a14", color: "#d1fae5", fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box}
        @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        input::placeholder{color:#022c22}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#064e3b;border-radius:2px}
      `}</style>

      <div style={{ borderBottom: "1px solid #064e3b", padding: "15px 26px", display: "flex", alignItems: "center", gap: 12, background: "#022c22" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#059669,#0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em", color: "#34d399" }}>Quick Install</div>
          <div style={{ fontSize: 11, color: "#064e3b" }}>One-command setup for any project</div>
        </div>
        {ctx && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <StackBadge label={ctx.primaryStack} active color={STACK_COLORS[ctx.primaryStack] || "#34d399"} />
            {ctx.framework && <StackBadge label={ctx.framework} active color="#a7f3d0" />}
            {ctx.hasDocker && <StackBadge label="docker" active color="#60a5fa" />}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 18px" }}>
        {/* Input */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>GitHub Repository</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#022c22", border: "1px solid #064e3b", borderRadius: 8, overflow: "hidden", padding: "0 0 0 12px" }}>
              <span style={{ color: "#34d399", fontSize: 14, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>$ </span>
              <input value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !scanning && scan()}
                placeholder="git clone https://github.com/username/repo"
                style={{ flex: 1, padding: "11px 12px", background: "transparent", border: "none", color: "#6ee7b7", fontSize: 13, fontFamily: "'JetBrains Mono',monospace", outline: "none" }} />
            </div>
            <button onClick={scan} disabled={scanning || !url.trim()}
              style={{ padding: "11px 22px", borderRadius: 8, border: "none", background: scanning || !url.trim() ? "#022c22" : "#059669", color: scanning || !url.trim() ? "#064e3b" : "#011a14", fontSize: 13, fontWeight: 800, cursor: scanning ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {scanning ? scanMsg : "Scan →"}
            </button>
          </div>
          {scanError && <div style={{ marginTop: 6, color: "#ef4444", fontSize: 12 }}>⚠ {scanError}</div>}
          {!ctx && !scanning && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#022c22" }}>Try:</span>
              {["tiangolo/fastapi", "vercel/next.js", "expressjs/express"].map(eg => (
                <button key={eg} onClick={() => setUrl(`https://github.com/${eg}`)} style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid #064e3b", background: "transparent", color: "#064e3b", fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>{eg}</button>
              ))}
            </div>
          )}
        </div>

        {ctx && (
          <div style={{ animation: "fadein .3s ease" }}>
            {/* Stack detection card */}
            <div style={{ background: "#022c22", border: "1px solid #064e3b", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Detected Stack</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8, marginBottom: 12 }}>
                {[
                  ["Runtime", ctx.primaryStack, STACK_COLORS[ctx.primaryStack] || "#34d399"],
                  ["Framework", ctx.framework || "—", "#a7f3d0"],
                  ["Entry Point", ctx.entryPoint?.split("/").pop() || "—", "#34d399"],
                  ["Port", ctx.port ? `:${ctx.port}` : "—", "#6ee7b7"],
                  ["Database", ctx.hasDb ? "detected" : "none", ctx.hasDb ? "#f59e0b" : "#064e3b"],
                  ["Docker", ctx.hasDocker ? "yes" : "no", ctx.hasDocker ? "#60a5fa" : "#064e3b"],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background: "#011a14", borderRadius: 7, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
                  </div>
                ))}
              </div>
              {ctx.envVars.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Env Variables Required</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {ctx.envVars.map(v => <code key={v} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "#011a14", color: "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>{v}</code>)}
                  </div>
                </div>
              )}
            </div>

            {/* Audience selector + generate */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Audience</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    ["dev", "👨‍💻 Developers", "Terse — commands only"],
                    ["nondev", "👥 Non-Devs", "Step-by-step, no jargon"],
                    ["both", "🔀 Both", "Two-section guide"],
                  ].map(([id, label, desc]) => (
                    <div key={id} onClick={() => setAudience(id)}
                      style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${audience === id ? "#059669" : "#064e3b"}`, background: audience === id ? "#022c22" : "transparent", cursor: "pointer", transition: "all .17s" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: audience === id ? "#34d399" : "#064e3b" }}>{label}</div>
                      <div style={{ fontSize: 10, color: audience === id ? "#059669" : "#022c22", marginTop: 2 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 24 }}>
                <button onClick={generate} disabled={generating}
                  style={{ padding: "11px 22px", borderRadius: 8, border: "none", background: generating ? "#022c22" : "#059669", color: generating ? "#064e3b" : "#011a14", fontSize: 13, fontWeight: 800, cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  {generating ? "Generating…" : "Generate Guide ⚡"}
                </button>
                {genError && <div style={{ color: "#ef4444", fontSize: 11 }}>⚠ {genError}</div>}
              </div>
            </div>

            {/* One-liners */}
            {oneLiners && Object.keys(oneLiners).length > 0 && (
              <div style={{ marginBottom: 20, animation: "fadein .3s ease" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  ⚡ One-Line Commands
                </div>
                {oneLiners.combined && <CopyCmd cmd={oneLiners.combined} label="clone + install + run (all-in-one)" />}
                {oneLiners.clone && <CopyCmd cmd={oneLiners.clone} label="clone" />}
                {oneLiners.install && <CopyCmd cmd={oneLiners.install} label="install" />}
                {oneLiners.run && <CopyCmd cmd={oneLiners.run} label="run" />}
              </div>
            )}

            {/* Full guide output */}
            {output && (
              <div style={{ border: "1px solid #064e3b", borderRadius: 10, overflow: "hidden", animation: "fadein .35s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "#022c22", borderBottom: "1px solid #064e3b", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>⚡ Install Guide · {audience === "dev" ? "Developers" : audience === "nondev" ? "Non-Devs" : "Both Audiences"}</span>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", background: "#011a14", border: "1px solid #064e3b", borderRadius: 6, overflow: "hidden" }}>
                    {["preview", "raw"].map(v => (
                      <button key={v} onClick={() => setView(v)} style={{ padding: "4px 10px", border: "none", background: view === v ? "#064e3b" : "transparent", color: view === v ? "#34d399" : "#064e3b", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        {v === "preview" ? "👁" : "⌨"}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #064e3b", background: copied ? "#022c22" : "#011a14", color: copied ? "#34d399" : "#059669", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {copied ? "✓" : "⎘ Copy"}
                  </button>
                </div>
                <div style={{ maxHeight: 520, overflowY: "auto", background: "#011a14" }}>
                  {view === "raw"
                    ? <pre style={{ margin: 0, padding: 16, fontSize: 12, lineHeight: 1.75, color: "#059669", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'JetBrains Mono',monospace" }}>{output}</pre>
                    : <div style={{ padding: "20px 24px" }} dangerouslySetInnerHTML={{ __html: renderMd(output) }} />
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {!ctx && !scanning && !scanError && (
          <div style={{ textAlign: "center", padding: "50px 0" }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#064e3b", lineHeight: 2, marginBottom: 20 }}>
              <div>$ git clone https://github.com/your/repo</div>
              <div style={{ color: "#022c22" }}>$ cd repo && npm install && npm start</div>
              <div style={{ color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <span style={{ display: "inline-block", width: 8, height: 14, background: "#34d399", animation: "blink 1s infinite" }} />
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#064e3b", marginBottom: 6 }}>One-command setup for any repo</div>
            <div style={{ fontSize: 12, color: "#022c22", maxWidth: 400, margin: "0 auto", lineHeight: 1.85 }}>
              Auto-detects your stack, entry point, and dependencies — then generates install guides for both developers and non-technical users.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
