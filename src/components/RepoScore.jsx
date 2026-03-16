import { useState } from "react";

// ─── GitHub API ───────────────────────────────────────────────────────────────
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
    try {
      const r = await fetch(`${RAW}/${owner}/${repo}/${b}/${file}`);
      if (r.ok) return r.text();
    } catch {}
  }
  return null;
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

function scoreDocumentation(files, readme) {
  const f = files.map(x => x.toLowerCase());
  let score = 0;
  const issues = [];
  const wins = [];

  const hasReadme = f.some(x => x === "readme.md" || x === "readme.txt");
  if (hasReadme) { score += 15; wins.push("README.md exists"); }
  else { issues.push({ sev: "critical", msg: "No README.md — first thing recruiters look for" }); }

  if (readme) {
    const lower = readme.toLowerCase();
    const len = readme.length;
    if (len > 800) { score += 10; wins.push("README has substantial content"); }
    else { issues.push({ sev: "high", msg: `README is only ${len} chars — too thin, expand it` }); }

    if (lower.includes("install") || lower.includes("npm install") || lower.includes("pip install"))
      { score += 8; wins.push("Installation instructions present"); }
    else issues.push({ sev: "high", msg: "No installation instructions in README" });

    if (lower.includes("usage") || lower.includes("example") || lower.includes("```"))
      { score += 7; wins.push("Usage examples present"); }
    else issues.push({ sev: "medium", msg: "No usage examples or code blocks in README" });

    if (lower.includes("screenshot") || lower.includes("demo") || lower.includes("gif") || lower.includes(".png"))
      { score += 5; wins.push("Visual demo/screenshot referenced"); }
    else issues.push({ sev: "medium", msg: "No screenshot or demo — visuals dramatically increase engagement" });
  } else {
    issues.push({ sev: "critical", msg: "README is empty or unreadable" });
  }

  const hasContrib = f.some(x => x.startsWith("contributing"));
  if (hasContrib) { score += 5; wins.push("CONTRIBUTING.md present"); }
  else issues.push({ sev: "low", msg: "No CONTRIBUTING.md — open source repos expect this" });

  return { score: Math.min(score, 50), max: 50, issues, wins, label: "Documentation" };
}

function scoreProjectStructure(files, languages) {
  const f = files.map(x => x.toLowerCase());
  const topLevel = [...new Set(files.map(x => x.split("/")[0]).filter(Boolean))];
  let score = 0;
  const issues = [];
  const wins = [];

  const hasLicense = f.some(x => x.startsWith("license"));
  if (hasLicense) { score += 8; wins.push("LICENSE file present"); }
  else issues.push({ sev: "high", msg: "No LICENSE — repo is legally ambiguous, reduces trust" });

  const hasGitignore = f.some(x => x === ".gitignore");
  if (hasGitignore) { score += 5; wins.push(".gitignore present"); }
  else issues.push({ sev: "medium", msg: "No .gitignore — likely committing node_modules or .env files" });

  const hasDotenv = f.some(x => x === ".env" || x.includes("/.env"));
  if (hasDotenv) issues.push({ sev: "critical", msg: ".env file committed — may contain exposed secrets!" });

  const hasNodeModules = files.some(x => x.startsWith("node_modules/"));
  if (hasNodeModules) issues.push({ sev: "critical", msg: "node_modules committed — shows inexperience, bloats repo" });

  const topCount = topLevel.length;
  if (topCount <= 12) { score += 7; wins.push("Clean top-level folder structure"); }
  else issues.push({ sev: "low", msg: `${topCount} items in root — too cluttered, reorganize into src/, docs/, etc.` });

  const hasTests = f.some(x => x.includes("test") || x.includes("spec") || x.includes("__tests__"));
  if (hasTests) { score += 10; wins.push("Test files detected"); }
  else issues.push({ sev: "high", msg: "No tests found — a dealbreaker for many engineering teams" });

  return { score: Math.min(score, 30), max: 30, issues, wins, label: "Project Structure" };
}

function scoreCodeQuality(files, commits, pkg) {
  let score = 0;
  const issues = [];
  const wins = [];
  const f = files.map(x => x.toLowerCase());

  const hasLinter = f.some(x => x.includes(".eslintrc") || x.includes(".pylintrc") || x.includes("rubocop") || x.includes(".flake8"));
  if (hasLinter) { score += 5; wins.push("Linter config detected"); }
  else issues.push({ sev: "medium", msg: "No linter config (.eslintrc, .pylintrc) — suggests inconsistent code style" });

  const hasFormatter = f.some(x => x.includes("prettier") || x.includes(".editorconfig") || x.includes("black"));
  if (hasFormatter) { score += 4; wins.push("Code formatter configured"); }
  else issues.push({ sev: "low", msg: "No code formatter config — add Prettier or Black for consistency" });

  const hasCI = f.some(x => x.includes(".github/workflows") || x.includes(".travis.yml") || x.includes("circle"));
  if (hasCI) { score += 8; wins.push("CI/CD pipeline configured"); }
  else issues.push({ sev: "high", msg: "No CI/CD — automated testing pipeline is a professional standard" });

  const hasEnvExample = f.some(x => x.includes(".env.example") || x.includes("env.example"));
  if (hasEnvExample) { score += 3; wins.push(".env.example committed"); }
  else issues.push({ sev: "medium", msg: "No .env.example — new devs won't know what env vars to set" });

  if (pkg) {
    try {
      const p = JSON.parse(pkg);
      if (p.scripts?.test) { score += 5; wins.push("npm test script defined"); }
      else issues.push({ sev: "medium", msg: "No test script in package.json" });
    } catch {}
  }

  return { score: Math.min(score, 25), max: 25, issues, wins, label: "Code Quality Signals" };
}

function scoreCommitHealth(commits) {
  let score = 0;
  const issues = [];
  const wins = [];

  if (!commits || commits.length === 0) {
    issues.push({ sev: "medium", msg: "Could not read commit history" });
    return { score: 0, max: 20, issues, wins, label: "Commit Health" };
  }

  const msgs = commits.map(c => c.commit?.message || "");
  const badPatterns = /^(fix|wip|asdf|test|temp|update|misc|stuff|changes|edit|aaa|lol|commit|\.|ok$)/i;
  const badCommits = msgs.filter(m => badPatterns.test(m.trim()) || m.trim().length < 8);
  const badPct = badCommits.length / msgs.length;

  if (badPct < 0.15) { score += 8; wins.push("Commit messages are descriptive"); }
  else if (badPct < 0.4) {
    score += 4;
    issues.push({ sev: "medium", msg: `${Math.round(badPct * 100)}% of commits have poor messages (e.g. "${badCommits[0]}")` });
  } else {
    issues.push({ sev: "high", msg: `${Math.round(badPct * 100)}% of commits are lazy (e.g. "${badCommits[0]}") — rewrite recent history` });
  }

  const recent = commits[0];
  if (recent) {
    const daysSince = (Date.now() - new Date(recent.commit.author.date)) / 86400000;
    if (daysSince < 90) { score += 6; wins.push(`Active — last commit ${Math.round(daysSince)} days ago`); }
    else issues.push({ sev: "low", msg: `Last commit was ${Math.round(daysSince)} days ago — looks abandoned` });
  }

  const unique = new Set(commits.map(c => c.commit?.author?.email)).size;
  if (unique > 1) { score += 6; wins.push(`${unique} contributors — shows collaboration`); }
  else score += 3;

  return { score: Math.min(score, 20), max: 20, issues, wins, label: "Commit Health" };
}

function scoreDependencies(pkg, files) {
  let score = 0;
  const issues = [];
  const wins = [];
  const f = files.map(x => x.toLowerCase());

  const hasLockfile = f.some(x => x === "package-lock.json" || x === "yarn.lock" || x === "poetry.lock" || x === "pipfile.lock");
  if (hasLockfile) { score += 5; wins.push("Lockfile committed — reproducible builds"); }
  else issues.push({ sev: "medium", msg: "No lockfile (package-lock.json / yarn.lock) — builds may be non-reproducible" });

  if (pkg) {
    try {
      const p = JSON.parse(pkg);
      const deps = { ...p.dependencies, ...p.devDependencies };
      const wildcards = Object.entries(deps).filter(([, v]) => v.startsWith("*") || v === "latest");
      if (wildcards.length > 0)
        issues.push({ sev: "medium", msg: `${wildcards.length} dependencies use wildcard versions — pin them for stability` });
      else if (Object.keys(deps).length > 0) { score += 5; wins.push("All dependency versions are pinned"); }
    } catch {}
  }

  return { score: Math.min(score, 10), max: 10, issues, wins, label: "Dependencies" };
}

// ─── Claude AI analysis ───────────────────────────────────────────────────────

async function getAIVerdict(repoData, allDimensions, totalScore) {
  const summary = allDimensions.map(d =>
    `${d.label}: ${d.score}/${d.max}\nIssues: ${d.issues.map(i => i.msg).join("; ") || "none"}`
  ).join("\n\n");

  const prompt = `You are a senior engineering recruiter reviewing a GitHub portfolio repo.

Repo: ${repoData.owner}/${repoData.name}
Language: ${repoData.language}
Stars: ${repoData.stars} | Forks: ${repoData.forks}
Score: ${totalScore}/100

Dimension breakdown:
${summary}

Write a blunt, honest 3-paragraph recruiter verdict:
1. First impression (what a recruiter sees in 30 seconds)
2. The 2-3 most damaging specific issues and exactly how to fix them
3. What this repo would look like after fixes — and whether it would pass a screen

Be specific, direct, and name actual files/patterns. No generic advice. No fluff. Max 180 words.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are a senior engineering recruiter who reviews GitHub profiles. Be direct, specific, and honest. Never give generic advice.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

// ─── Main analysis runner ─────────────────────────────────────────────────────

async function analyzeRepo(owner, repo) {
  const [repoData, treeData, commitsData, langs] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}`),
    ghFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`),
    ghFetch(`/repos/${owner}/${repo}/commits?per_page=30`),
    ghFetch(`/repos/${owner}/${repo}/languages`),
  ]);

  if (!repoData) throw new Error("Repo not found or is private.");

  const tree = treeData?.tree || [];
  const files = tree.map(f => f.path).filter(Boolean);
  const branch = repoData.default_branch || "main";

  const [readme, pkg] = await Promise.all([
    tryRaw(owner, repo, "README.md", branch),
    tryRaw(owner, repo, "package.json", branch),
  ]);

  const dimensions = [
    scoreDocumentation(files, readme),
    scoreProjectStructure(files, langs),
    scoreCodeQuality(files, commitsData, pkg),
    scoreCommitHealth(commitsData),
    scoreDependencies(pkg, files),
  ];

  const totalScore = dimensions.reduce((s, d) => s + d.score, 0);

  const ctx = {
    owner, repo: repoData.name,
    name: repoData.name,
    language: Object.keys(langs || {})[0] || "Unknown",
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    description: repoData.description || "",
    branch,
  };

  const verdict = await getAIVerdict(ctx, dimensions, totalScore);

  return { score: totalScore, dimensions, verdict, ctx };
}

// ─── UI ───────────────────────────────────────────────────────────────────────

const SEV_COLOR = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#64748b" };
const SEV_LABEL = { critical: "CRITICAL", high: "HIGH", medium: "MED", low: "LOW" };

function getScoreColor(s) {
  if (s >= 80) return "#22c55e";
  if (s >= 60) return "#84cc16";
  if (s >= 40) return "#eab308";
  if (s >= 25) return "#f97316";
  return "#ef4444";
}

function getScoreGrade(s) {
  if (s >= 85) return "A";
  if (s >= 70) return "B";
  if (s >= 55) return "C";
  if (s >= 40) return "D";
  return "F";
}

function getRecruiterLine(s) {
  if (s >= 85) return "Strong candidate — repo passes the screen";
  if (s >= 70) return "Decent repo — a few fixes before applying";
  if (s >= 55) return "Needs work — wouldn't pass most screens";
  if (s >= 40) return "Significant issues — likely rejected on sight";
  return "Do not submit this repo to recruiters yet";
}

function ScoreRing({ score, size = 140 }) {
  const color = getScoreColor(score);
  const grade = getScoreGrade(score);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 11, color: "#475569", letterSpacing: "0.1em", marginTop: 2 }}>/100</div>
      </div>
    </div>
  );
}

function DimensionBar({ dim, index }) {
  const pct = Math.round((dim.score / dim.max) * 100);
  const color = getScoreColor(pct);
  const allIssues = dim.issues;
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid #1e293b", padding: "14px 0", animationDelay: `${index * 80}ms`, animation: "slideup .4s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>{dim.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace" }}>{dim.score}<span style={{ color: "#334155", fontWeight: 400 }}>/{dim.max}</span></span>
          </div>
          <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 1s cubic-bezier(.4,0,.2,1)" }} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#334155", userSelect: "none", flexShrink: 0 }}>{open ? "▲" : "▼"}</div>
      </div>

      {open && (
        <div style={{ marginTop: 8, paddingLeft: 0 }}>
          {dim.wins.map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#4ade80", padding: "3px 0" }}>
              <span>✓</span><span>{w}</span>
            </div>
          ))}
          {allIssues.map((iss, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0" }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 5px", borderRadius: 3, background: SEV_COLOR[iss.sev] + "22", color: SEV_COLOR[iss.sev], flexShrink: 0, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.04em" }}>{SEV_LABEL[iss.sev]}</span>
              <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{iss.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IssueList({ dimensions }) {
  const all = dimensions.flatMap(d => d.issues.map(i => ({ ...i, dim: d.label })));
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  all.sort((a, b) => order[a.sev] - order[b.sev]);

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Priority Fix List</div>
      {all.map((iss, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #0f172a" }}>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, background: SEV_COLOR[iss.sev] + "20", color: SEV_COLOR[iss.sev], fontFamily: "'JetBrains Mono',monospace" }}>{SEV_LABEL[iss.sev]}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.55 }}>{iss.msg}</div>
            <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{iss.dim}</div>
          </div>
        </div>
      ))}
      {all.length === 0 && <div style={{ color: "#4ade80", fontSize: 13 }}>✓ No issues found — excellent repo!</div>}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function RepoScore() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const LOAD_MSGS = [
    "Fetching repo metadata…",
    "Scanning file structure…",
    "Reading commit history…",
    "Analyzing code quality signals…",
    "Getting recruiter verdict from AI…",
  ];

  const run = async () => {
    const parsed = parseUrl(url.trim());
    if (!parsed) { setError("Enter a valid GitHub repo URL."); return; }
    setError(""); setResult(null); setLoading(true);
    let mi = 0;
    setLoadMsg(LOAD_MSGS[0]);
    const interval = setInterval(() => { mi = Math.min(mi + 1, LOAD_MSGS.length - 1); setLoadMsg(LOAD_MSGS[mi]); }, 2200);
    try {
      const r = await analyzeRepo(parsed.owner, parsed.repo);
      setResult(r);
      setActiveTab("overview");
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      clearInterval(interval); setLoading(false);
    }
  };

  const scoreColor = result ? getScoreColor(result.score) : "#64748b";
  const grade = result ? getScoreGrade(result.score) : "";

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700;800&display=swap');
        *{box-sizing:border-box}
        @keyframes slideup{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes fadein{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes scan{0%{top:0}100%{top:100%}}
        input::placeholder{color:#334155}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f172a", padding: "18px 32px", display: "flex", alignItems: "center", gap: 16, background: "#020817" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>
          <span style={{ color: "#ef4444" }}>REPO</span><span style={{ color: "#475569" }}>::</span><span style={{ color: "#94a3b8" }}>SCORE</span>
        </div>
        <div style={{ width: 1, height: 20, background: "#1e293b" }} />
        <div style={{ fontSize: 12, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>portfolio job-readiness analyzer</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>v1.0</span>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "36px 20px" }}>

        {/* Input */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: "#334155", marginBottom: 8, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em" }}>// ENTER REPOSITORY URL</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && run()}
              placeholder="https://github.com/username/repository"
              style={{ flex: 1, padding: "12px 16px", borderRadius: 6, background: "#0a0f1a", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: 14, fontFamily: "'JetBrains Mono',monospace", outline: "none", transition: "border-color .2s" }}
              onFocus={e => e.target.style.borderColor = "#ef4444"}
              onBlur={e => e.target.style.borderColor = "#1e293b"}
            />
            <button onClick={run} disabled={loading || !url.trim()} style={{ padding: "12px 24px", borderRadius: 6, border: "1px solid #ef444440", background: loading || !url.trim() ? "#0a0f1a" : "#ef444415", color: loading || !url.trim() ? "#334155" : "#ef4444", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap", transition: "all .2s", letterSpacing: "0.04em" }}>
              {loading ? "SCANNING…" : "RUN ANALYSIS →"}
            </button>
          </div>
          {error && <div style={{ marginTop: 8, color: "#ef4444", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>ERROR: {error}</div>}

          {/* Examples */}
          {!result && !loading && (
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#1e293b", fontFamily: "'JetBrains Mono',monospace" }}>// try:</span>
              {["facebook/react", "tiangolo/fastapi", "you/your-project"].map(eg => (
                <button key={eg} onClick={() => eg !== "you/your-project" && setUrl(`https://github.com/${eg}`)}
                  style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #1e293b", background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>{eg}</button>
              ))}
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", animation: "fadein .3s ease" }}>
            <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 24px", border: "1px solid #1e293b", borderRadius: 4, overflow: "hidden", background: "#0a0f1a" }}>
              <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,#ef4444,transparent)", animation: "scan 1.5s linear infinite" }} />
              <div style={{ padding: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ height: 4, background: "#1e293b", borderRadius: 2, marginBottom: 6, width: `${60 + Math.random() * 40}%`, animation: `pulse ${1 + i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", color: "#ef4444", fontSize: 13, letterSpacing: "0.04em" }}>{loadMsg}</div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ animation: "fadein .4s ease" }}>

            {/* Score hero */}
            <div style={{ display: "flex", gap: 24, alignItems: "center", padding: "28px 28px", background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 8, marginBottom: 24 }}>
              <ScoreRing score={result.score} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#334155", letterSpacing: "0.1em" }}>GRADE</div>
                  <div style={{ fontSize: 42, fontWeight: 900, color: scoreColor, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{grade}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: scoreColor, marginBottom: 6 }}>{getRecruiterLine(result.score)}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {result.ctx.owner}/{result.ctx.name} · {result.ctx.language} · ⭐ {result.ctx.stars}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {result.dimensions.map(d => {
                    const pct = Math.round((d.score / d.max) * 100);
                    return (
                      <div key={d.label} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 3, background: getScoreColor(pct) + "15", color: getScoreColor(pct), fontFamily: "'JetBrains Mono',monospace", border: `1px solid ${getScoreColor(pct)}30` }}>
                        {d.label.split(" ")[0]} {d.score}/{d.max}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #1e293b" }}>
              {[
                { id: "overview", label: "OVERVIEW" },
                { id: "issues", label: "ISSUES" },
                { id: "verdict", label: "RECRUITER VERDICT" },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "10px 18px", border: "none", borderBottom: `2px solid ${activeTab === t.id ? "#ef4444" : "transparent"}`, background: "transparent", color: activeTab === t.id ? "#ef4444" : "#334155", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", transition: "all .15s", marginBottom: -1 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {activeTab === "overview" && (
              <div>
                {result.dimensions.map((d, i) => <DimensionBar key={d.label} dim={d} index={i} />)}
              </div>
            )}

            {/* Issues tab */}
            {activeTab === "issues" && (
              <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 8, padding: 20 }}>
                <IssueList dimensions={result.dimensions} />
              </div>
            )}

            {/* Verdict tab */}
            {activeTab === "verdict" && (
              <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 8, padding: 24 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #1e293b" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 4, background: "#ef444415", border: "1px solid #ef444430", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧑‍💼</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>Senior Engineering Recruiter</div>
                    <div style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>AI analysis · {result.ctx.owner}/{result.ctx.name}</div>
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: 28, fontWeight: 900, color: scoreColor, fontFamily: "'JetBrains Mono',monospace" }}>{grade}</div>
                </div>
                <div style={{ fontSize: 13.5, color: "#94a3b8", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{result.verdict}</div>
              </div>
            )}

            {/* CTA */}
            <div style={{ marginTop: 20, padding: "16px 20px", background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>// fix issues → re-run to track improvement</div>
              <button onClick={run} style={{ padding: "7px 16px", borderRadius: 4, border: "1px solid #1e293b", background: "transparent", color: "#475569", fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>RE-SCAN →</button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !result && !error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#1e293b" }}>
            <div style={{ fontSize: 64, marginBottom: 16, fontFamily: "'JetBrains Mono',monospace", fontWeight: 900, color: "#0f172a" }}>?</div>
            <div style={{ fontSize: 14, color: "#334155", fontFamily: "'JetBrains Mono',monospace" }}>// awaiting repository url</div>
            <div style={{ fontSize: 12, color: "#1e293b", marginTop: 6 }}>analyzes documentation · structure · code quality · commit health · dependencies</div>
          </div>
        )}
      </div>
    </div>
  );
}
