# GitPoer: AI-Powered Repository Optimizer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/Frontend-React-61dafb)](https://reactjs.org/)
[![Powered by Claude](https://img.shields.io/badge/AI-Claude%203.5%20Sonnet-7c3aed)](https://www.anthropic.com/)

**GitPoer** is an intelligence suite designed to transform messy GitHub repositories into professional, recruiter-ready portfolios. By leveraging automated scoring algorithms and advanced LLM integration, GitPoer eliminates documentation debt and technical clutter, providing developers with a high-impact presentation of their work through automated scoring, AI-driven documentation, and smart changelog generation.

---

## 🖥 Visuals

![GitPoer Dashboard Placeholder](https://via.placeholder.com/800x450/020817/e2e8f0?text=GitPoer+Modern+Dark+Dashboard+Interface)
*The GitPoer interface features a clean, high-contrast dark theme optimized for developer focus, featuring a modular sidebar and real-time analysis animations.*

---

## 🚀 Features

- **RepoScore Engine**: Quantifies job-readiness by analyzing code quality signals, commit history health, and documentation coverage to provide an actionable letter grade.
- **AI Documentation Suite**: Generates context-aware READMEs, Quick Start guides, and Wikis tailored to specific technical audiences (from Intern to Senior Stakeholders).
- **Smart Changelogs**: Automatically converts complex Git diffs and commit hashes into plain-English release notes.
- **PR Autopilot & Audit**: Performs deep structural analysis and automated code reviews to ensure codebase compliance with industry standards.

---

## 🛠 Prerequisites

Before setting up GitPoer, ensure you have the following:
- **Node.js 18+**
- **npm** or **yarn**
- **Anthropic API Key** (Claude 3.5 Sonnet access)

---

## 📦 Installation

Get up and running with these commands:

```bash
# Clone the repository
git clone https://github.com/username/gitpoer.git

# Navigate to the project directory
cd gitpoer

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

> **Note:** Open your `.env` file and populate the `VITE_ANTHROPIC_API_KEY` field with your key from the Anthropic Console.

---

## 💡 Usage

To launch the development environment:

```bash
npm run dev
```

1. Open the application in your browser (usually `http://localhost:5173`).
2. Authenticate via the GitHub login simulator.
3. Enter any public GitHub URL (e.g., `https://github.com/facebook/react`) into the analysis bar.
4. View the real-time RepoScore breakdown and generate documentation assets instantly.

---

## 📂 Project Structure

```
src/
├── api/             # Auth context and state management
├── components/      # Modular UI features (RepoScore, Cleaner, etc.)
├── config/          # Global constants and API endpoints
├── pages/           # High-level views (Landing, Dashboard)
├── services/        # Logic layers for GitHub and Anthropic APIs
└── utils/           # Helper functions and markdown parsers
```

---

## 🤝 Contributing

We welcome contributions that improve the intelligence or efficiency of the suite.
- Use **feature branches** for all changes (`git checkout -b feature/amazing-feature`).
- Focus on maintaining **clean, modular React code** and consistent styling.
- Ensure all new services are documented within the `src/services` directory.

---

## ⚖️ License

Distributed under the **MIT License**. See `LICENSE` for more information.

---
*Built for developers who care about first impressions.*