# RepoPolish — Deployment Guide

## Overview

RepoPolish is a React single-page app that calls the Anthropic API directly from the browser. To deploy it as a live web service, you need:

1. **A frontend host** — serves the React app
2. **A backend proxy** — holds your Anthropic API key securely (never expose it client-side in production)
3. **A domain** (optional, but professional)

The three realistic MVP paths are below, ranked by setup speed.

---

## Option A — Replit (Fastest, ~15 minutes)

Best for: demos, hackathons, sharing with friends.

### Steps

1. Go to [replit.com](https://replit.com) → **Create Repl** → choose **Node.js**
2. Create `index.js` (Express proxy server):

```js
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public")); // serves your built React app

app.post("/api/claude", async (req, res) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();
  res.json(data);
});

app.listen(3000, () => console.log("Running on port 3000"));
```

3. In **Secrets** (padlock icon in sidebar), add:
   ```
   ANTHROPIC_API_KEY = sk-ant-...your key...
   ```
4. Update the React app's `callClaude()` function to point to your proxy:
   ```js
   // Change this line in the app:
   const res = await fetch("https://api.anthropic.com/v1/messages", ...);
   // To:
   const res = await fetch("/api/claude", ...);
   ```
5. Build the React app (`npm run build`) and put the output in `/public`
6. Hit **Run** — Replit gives you a live URL like `https://repoPolish.yourname.repl.co`

### Limitations
- Free tier sleeps after inactivity (cold start ~5s)
- Not ideal for production traffic

---

## Option B — Vercel (Recommended for Production, ~20 minutes)

Best for: real users, professional portfolio, scaling.

### Architecture

```
User Browser
    │
    ▼
Vercel Edge (serves React SPA)
    │
    ▼
Vercel Serverless Function  (/api/claude.js)
    │  holds ANTHROPIC_API_KEY securely
    ▼
Anthropic API
```

### Steps

**1. Create the project structure**

```
repoPolish/
├── api/
│   └── claude.js        ← serverless function (proxy)
├── src/
│   └── App.jsx          ← your React app
├── public/
│   └── index.html
└── package.json
```

**2. Serverless proxy** (`api/claude.js`):

```js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(req.body),
  });

  const data = await response.json();
  res.status(200).json(data);
}
```

**3. Update `callClaude()` in your React app:**

```js
const res = await fetch("/api/claude", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: "claude-sonnet-4-20250514", ... }),
});
```

**4. Deploy**

```bash
npm install -g vercel
vercel login
vercel                    # follow prompts, it auto-detects React
```

**5. Set environment variable in Vercel dashboard:**
- Project → Settings → Environment Variables
- Add `ANTHROPIC_API_KEY` = `sk-ant-...`
- Redeploy

**6. Custom domain (optional):**
- Vercel dashboard → Domains → Add your domain
- Update DNS at your registrar

### Cost
- Vercel free tier: 100GB bandwidth/month, 100k serverless function invocations — plenty for MVP
- Anthropic API: ~$0.003 per README generated (Claude Sonnet pricing)

---

## Option C — GitHub Pages + Cloudflare Worker (~25 minutes)

Best for: zero server costs, fully static frontend.

### Architecture

```
GitHub Pages (static React app)
        │
        ▼
Cloudflare Worker (API proxy with rate limiting)
        │
        ▼
Anthropic API
```

### Steps

**1. Cloudflare Worker** (at workers.cloudflare.com → Create Worker):

```js
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "https://yourusername.github.io",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const body = await request.json();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://yourusername.github.io",
      },
    });
  },
};
```

**2. Add secret in Cloudflare dashboard:**
- Worker → Settings → Variables → add `ANTHROPIC_API_KEY`

**3. Deploy React app to GitHub Pages:**

```bash
npm install gh-pages --save-dev
```

Add to `package.json`:
```json
"homepage": "https://yourusername.github.io/repoPolish",
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d build"
}
```

```bash
npm run deploy
```

**4. Update `callClaude()` to use your Worker URL:**
```js
const res = await fetch("https://your-worker.yourname.workers.dev", { ... });
```

### Cost
- GitHub Pages: free
- Cloudflare Workers: free tier = 100k requests/day

---

## Rate Limiting & Abuse Prevention (Important)

Add these protections before going public:

```js
// In your proxy (Vercel or Cloudflare):

// 1. Limit requests per IP (simple in-memory, or use Upstash Redis)
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 5;

  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const timestamps = rateLimitMap.get(ip).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

// 2. Validate request body
if (!req.body.messages || !Array.isArray(req.body.messages)) {
  return res.status(400).json({ error: "Invalid request" });
}

// 3. Force your model (don't let users switch to expensive models)
req.body.model = "claude-sonnet-4-20250514";
req.body.max_tokens = Math.min(req.body.max_tokens || 1000, 1500);
```

---

## Environment Variables Summary

| Variable | Where to set | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | Replit Secrets / Vercel Env / CF Worker Secrets | `sk-ant-api03-...` |
| `ALLOWED_ORIGIN` | Vercel / CF Worker | Your frontend URL |

---

## Recommended Stack for MVP Launch

| Layer | Tool | Why |
|---|---|---|
| Frontend | Vercel | Auto-deploys from GitHub, free SSL, CDN |
| API proxy | Vercel Serverless Function | Same repo, zero config |
| Rate limiting | Upstash Redis (free tier) | Persistent across function instances |
| Analytics | Vercel Analytics | Built-in, free |
| Domain | Namecheap (~$10/yr) | Professional look |

**Total monthly cost at MVP scale (~500 users): ~$0–5/month**
