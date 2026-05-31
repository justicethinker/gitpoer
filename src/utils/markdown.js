// ── Markdown utilities ────────────────────────────────────────────────────────

/** Render markdown to HTML for the preview pane */
export function renderMd(md) {
  if (!md) return '';
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headings
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Fenced code blocks
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`)
    // HR
    .replace(/^---$/gm, '<hr>')
    // Unordered lists
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Tables (basic)
    .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g, (_, header, rows) => {
      const ths = header.split('|').filter(s => s.trim()).map(h => `<th>${h.trim()}</th>`).join('');
      const trs = rows.trim().split('\n').map(row => {
        const tds = row.split('|').filter(s => s.trim()).map(d => `<td>${d.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    })
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Paragraphs
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^(?!<[hpuolbrtc]|<hr|<pre|<table|<blockquote)(.+)$/gm, m => m.trim() ? `<p>${m}</p>` : '');
}

/** Download a string as a .md file */
export function dlMd(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy text to clipboard, returns a promise */
export async function copyToClipboard(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}
