const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mdPath = path.join(root, 'docs', 'GDD.md');
const htmlPath = path.join(root, 'docs', 'GDD.html');
const md = fs.readFileSync(mdPath, 'utf8').replace(/^\uFEFF/, '');
const updatedDate = '2026-05-29';

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function inline(text) {
  let output = escapeHtml(text);
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    return `<a href="${escapeAttr(href)}">${label}</a>`;
  });
  return output;
}

const lines = md.split(/\r?\n/);
const usedIds = new Set();
const headings = [];
let h2Index = -1;
let fallbackIndex = 0;
let body = '';
let title = 'GDD';
let firstH1 = true;
let i = 0;

function uniqueId(base) {
  let id = base;
  let n = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id);
  return id;
}

function makeId(level, text) {
  if (level === 2) {
    h2Index += 1;
    return uniqueId(`s${h2Index}`);
  }
  const decimal = text.match(/^(\d+)\.(\d+)/);
  if (decimal) return uniqueId(`s${decimal[1]}-${decimal[2]}`);
  const phase = text.match(/^Phase\s+(\d+)/i);
  if (phase) return uniqueId(`s${Math.max(h2Index, 0)}-phase-${phase[1]}`);
  return uniqueId(`h-${++fallbackIndex}`);
}

function isBlank(line) {
  return /^\s*$/.test(line);
}

function isHeading(line) {
  return /^(#{1,6})\s+/.test(line);
}

function isHr(line) {
  return /^\s*-{3,}\s*$/.test(line);
}

function isFence(line) {
  return /^\s*```/.test(line);
}

function isBlockquote(line) {
  return /^\s*>\s?/.test(line);
}

function isUnordered(line) {
  return /^\s*[-*]\s+/.test(line);
}

function isOrdered(line) {
  return /^\s*\d+\.\s+/.test(line);
}

function isTableStart(index) {
  if (!/^\s*\|.*\|\s*$/.test(lines[index] || '')) return false;
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || '');
}

function isSpecial(index) {
  const line = lines[index] || '';
  return (
    isBlank(line) ||
    isHeading(line) ||
    isHr(line) ||
    isFence(line) ||
    isBlockquote(line) ||
    isTableStart(index) ||
    isUnordered(line) ||
    isOrdered(line)
  );
}

function splitRow(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

while (i < lines.length) {
  const line = lines[i];
  if (isBlank(line)) {
    i += 1;
    continue;
  }

  if (isFence(line)) {
    const lang = line.trim().replace(/^```/, '').trim();
    i += 1;
    const code = [];
    while (i < lines.length && !isFence(lines[i])) {
      code.push(lines[i]);
      i += 1;
    }
    if (i < lines.length) i += 1;
    body += `<pre><code${lang ? ` class="language-${escapeAttr(lang)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>\n`;
    continue;
  }

  if (isHr(line)) {
    body += '<hr>\n';
    i += 1;
    continue;
  }

  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length;
    const text = heading[2].trim();
    if (level === 1) {
      title = text;
      body += `${firstH1 ? '<header class="doc-header">' : ''}<h1>${inline(text)}</h1>${
        firstH1 ? `<p class="doc-subtitle">Full GDD mirror - Source: docs/GDD.md - Updated ${updatedDate}</p></header>` : ''
      }\n`;
      firstH1 = false;
    } else {
      const id = makeId(level, text);
      headings.push({ level, text, id });
      body += `<h${level} id="${id}">${inline(text)}</h${level}>\n`;
    }
    i += 1;
    continue;
  }

  if (isBlockquote(line)) {
    const quote = [];
    while (i < lines.length && isBlockquote(lines[i])) {
      quote.push(lines[i].replace(/^\s*>\s?/, ''));
      i += 1;
    }
    body += `<blockquote>${quote.map((entry) => `<p>${inline(entry)}</p>`).join('')}</blockquote>\n`;
    continue;
  }

  if (isTableStart(i)) {
    const header = splitRow(lines[i]);
    i += 2;
    const rows = [];
    while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
      rows.push(splitRow(lines[i]));
      i += 1;
    }
    body += '<div class="table-wrap"><table>\n<thead><tr>';
    body += header.map((cell) => `<th>${inline(cell)}</th>`).join('');
    body += '</tr></thead>\n<tbody>\n';
    for (const row of rows) {
      body += `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>\n`;
    }
    body += '</tbody></table></div>\n';
    continue;
  }

  if (isUnordered(line) || isOrdered(line)) {
    const ordered = isOrdered(line);
    const tag = ordered ? 'ol' : 'ul';
    body += `<${tag}>\n`;
    while (i < lines.length && (ordered ? isOrdered(lines[i]) : isUnordered(lines[i]))) {
      const item = lines[i].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, '');
      body += `<li>${inline(item)}</li>\n`;
      i += 1;
    }
    body += `</${tag}>\n`;
    continue;
  }

  const para = [];
  while (i < lines.length && !isSpecial(i)) {
    para.push(lines[i].trim());
    i += 1;
  }
  body += `<p>${inline(para.join(' '))}</p>\n`;
}

const nav = headings
  .filter((heading) => heading.level === 2 || heading.level === 3)
  .map((heading) => `<a href="#${heading.id}" class="${heading.level === 3 ? 'sub' : ''}">${escapeHtml(heading.text)}</a>`)
  .join('\n');

const html = `<!DOCTYPE html>
<!-- Generated mirror of docs/GDD.md. Keep the Markdown file as the source of truth. -->
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
:root {
  --bg: #0a0a0f;
  --bg2: #0f0f18;
  --bg3: #171725;
  --panel: #11111b;
  --green: #4a9e6a;
  --green-light: #6abf8a;
  --gold: #c9a84c;
  --gold-light: #e8c96a;
  --text: #d4d4e3;
  --text-dim: #8f8fa8;
  --border: #2a2a3a;
  --nav-w: 248px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Georgia, 'Microsoft YaHei', 'PingFang SC', 'Noto Serif CJK SC', serif;
  font-size: 15px;
  line-height: 1.85;
}
nav {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--nav-w);
  background: var(--bg2);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 20px 0 28px;
  z-index: 10;
}
.nav-title {
  color: var(--gold);
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 0 18px 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}
nav a {
  display: block;
  padding: 7px 18px;
  color: var(--text-dim);
  text-decoration: none;
  font-size: 13px;
  border-left: 2px solid transparent;
}
nav a.sub { padding-left: 32px; font-size: 12px; }
nav a:hover, nav a.active {
  color: var(--green-light);
  background: rgba(74, 158, 106, 0.09);
  border-left-color: var(--green);
}
main {
  margin-left: var(--nav-w);
  min-height: 100vh;
  padding: 42px 44px 64px;
}
.content {
  width: min(1120px, 100%);
}
.doc-header {
  padding: 0 0 24px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
h1, h2, h3, h4, h5, h6 {
  color: var(--gold-light);
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: 0;
  scroll-margin-top: 24px;
}
h1 { font-size: 34px; margin: 0 0 8px; }
h2 { font-size: 25px; margin: 42px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
h3 { font-size: 19px; margin: 30px 0 12px; color: var(--green-light); }
h4 { font-size: 16px; margin: 24px 0 10px; color: var(--gold); }
p { margin: 12px 0; }
a { color: var(--green-light); }
.doc-subtitle { margin: 0; color: var(--text-dim); }
blockquote {
  margin: 18px 0;
  padding: 10px 16px;
  border-left: 3px solid var(--green);
  background: rgba(74, 158, 106, 0.08);
  color: var(--text);
}
blockquote p { margin: 6px 0; }
.table-wrap {
  width: 100%;
  overflow-x: auto;
  margin: 14px 0 22px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  background: var(--panel);
}
th, td {
  padding: 9px 11px;
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  vertical-align: top;
}
th:last-child, td:last-child { border-right: 0; }
tr:last-child td { border-bottom: 0; }
th {
  color: var(--gold-light);
  background: var(--bg3);
  text-align: left;
  white-space: nowrap;
}
ul, ol { padding-left: 24px; margin: 12px 0 20px; }
li { margin: 5px 0; }
pre {
  margin: 16px 0 24px;
  padding: 16px;
  overflow-x: auto;
  white-space: pre;
  background: #05050a;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: #dcdcea;
}
code {
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-size: 0.92em;
}
p code, li code, td code, blockquote code {
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
}
hr {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 30px 0;
}
footer {
  margin-top: 56px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 12px;
  text-align: center;
}
@media (max-width: 820px) {
  nav {
    position: static;
    width: 100%;
    max-height: 44vh;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  main {
    margin-left: 0;
    padding: 28px 18px 44px;
  }
  h1 { font-size: 28px; }
  h2 { font-size: 22px; }
  table { min-width: 560px; }
}
</style>
</head>
<body>
<nav id="sidebar">
  <div class="nav-title">GDD Mirror</div>
${nav}
</nav>
<main>
  <div class="content">
${body}
    <footer>GDD HTML mirror - Source: docs/GDD.md - Updated ${updatedDate}</footer>
  </div>
</main>
<script>
const links = Array.from(document.querySelectorAll('nav a'));
const sections = links
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);
const observer = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
  if (!visible) return;
  links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === '#' + visible.target.id));
}, { rootMargin: '-8% 0px -78% 0px', threshold: 0 });
sections.forEach((section) => observer.observe(section));
</script>
</body>
</html>
`;

fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`Generated ${path.relative(root, htmlPath)} from ${path.relative(root, mdPath)} with ${headings.length} headings.`);
