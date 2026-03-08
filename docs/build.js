#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const md = new MarkdownIt({
  html: true, linkify: true, typographer: true,
  highlight(str, lang) {
    if (lang === 'mermaid') return str; // handled by custom fence rule
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(str, { language: lang }).value; } catch (_) { /* fall through */ }
    }
    try { return hljs.highlightAuto(str).value; } catch (_) { /* fall through */ }
    return ''; // use default escaping
  },
});

// Render mermaid code blocks as <div class="mermaid"> for client-side rendering
const defaultFence = md.renderer.rules.fence.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim() === 'mermaid') {
    return `<div class="mermaid">${token.content}</div>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// Nav sections: directory name → display title (order matters)
const SECTIONS = [
  { dir: 'get-started', title: 'Get Started' },
  { dir: 'guide', title: 'Guide' },
  { dir: 'features', title: 'Features' },
  { dir: 'reference', title: 'Reference' },
  { dir: 'scenarios', title: 'Scenarios' },
  { dir: 'concepts', title: 'Concepts' },
  { dir: 'cookbook', title: 'Cookbook' },
  { dir: 'blog', title: 'Blog' },
];

// Explicit ordering within sections (filename without .md → priority)
const SECTION_ORDER = {
  'get-started': ['installation', 'first-session', 'migration'],
  'guide': ['tips-and-tricks', 'sample-prompts', 'personal-squad', 'contributing'],
  'features': [
    'team-setup', 'routing', 'model-selection', 'response-modes',
    'parallel-execution', 'memory', 'skills', 'directives',
    'ceremonies', 'reviewer-protocol',
    'github-issues', 'labels', 'prd-mode', 'project-boards',
    'ralph', 'copilot-coding-agent', 'human-team-members',
    'remote-control', 'vscode', 'worktrees',
    'export-import', 'upstream-inheritance', 'marketplace', 'plugins', 'mcp',
    'notifications',
  ],
  'reference': ['cli', 'sdk', 'config'],
  'scenarios': ['existing-repo', 'solo-dev', 'issue-driven-dev', 'monorepo', 'ci-cd-integration', 'team-of-humans', 'aspire-dashboard'],
  'concepts': ['your-team', 'memory-and-knowledge', 'parallel-work', 'github-workflow', 'portability'],
  'cookbook': ['recipes'],
};

// Parse optional YAML-style frontmatter (--- fenced)
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: match[2] };
}

// Extract first H1 as fallback title
function extractTitle(markdown) {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1] : null;
}

// Derive a human-readable title from a filename
function titleFromFilename(filename) {
  return filename
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Discover docs from all configured section directories
function discoverDocs(docsDir) {
  const sections = [];
  for (const { dir, title } of SECTIONS) {
    const sectionDir = path.join(docsDir, dir);
    if (!fs.existsSync(sectionDir)) continue;
    const items = fs.readdirSync(sectionDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const name = f.replace('.md', '');
        const raw = fs.readFileSync(path.join(sectionDir, f), 'utf-8');
        const { meta, body } = parseFrontmatter(raw);
        const docTitle = meta.title || extractTitle(body) || titleFromFilename(f);
        return { name, dir, title: docTitle, href: `${dir}/${name}.html` };
      });
    // index.md first; use explicit order if defined; blog chronological; rest alphabetical
    const order = SECTION_ORDER[dir];
    items.sort((a, b) => {
      if (a.name === 'index') return -1;
      if (b.name === 'index') return 1;
      if (order) {
        const ai = order.indexOf(a.name);
        const bi = order.indexOf(b.name);
        // Items in the order list come first, in that order; unlisted items go to end alphabetically
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
      }
      if (dir === 'blog') return a.name.localeCompare(b.name);
      return a.title.localeCompare(b.title);
    });
    if (items.length > 0) {
      sections.push({ title, dir, items });
    }
  }
  return sections;
}

// Discover the root index.md home page if it exists
function discoverHomePage(docsDir) {
  const indexPath = path.join(docsDir, 'index.md');
  if (!fs.existsSync(indexPath)) return null;
  const raw = fs.readFileSync(indexPath, 'utf-8');
  const { meta, body } = parseFrontmatter(raw);
  const title = meta.title || extractTitle(body) || 'Home';
  return { name: 'index', title, href: 'index.html' };
}

// Discover standalone pages (e.g. whatsnew.md) that aren't in any section
function discoverStandalonePages(docsDir) {
  const pages = [];
  const standaloneFiles = ['whatsnew.md', 'sdk-first-mode.md'];
  for (const f of standaloneFiles) {
    const filePath = path.join(docsDir, f);
    if (!fs.existsSync(filePath)) continue;
    const name = f.replace('.md', '');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const title = meta.title || extractTitle(body) || titleFromFilename(f);
    pages.push({ name, title, href: `${name}.html` });
  }
  return pages;
}

// Compute relative prefix from a subdir back to the dist root
function assetsPrefix(subdir) {
  if (!subdir) return '';
  const depth = subdir.split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

function buildNavHtml(sections, activeDir, activeFile, { homePage, standalonePages } = {}) {
  const prefix = assetsPrefix(activeDir);
  let html = '<nav class="sidebar" id="sidebar">\n';
  html += `<div class="sidebar-header"><a href="${prefix}index.html" class="logo"><img src="${prefix}assets/squad-logo.png" alt="Squad" class="sidebar-logo-img"></a><button class="sidebar-close" onclick="toggleSidebar()">X</button></div>\n`;
  html += '<div class="sidebar-content">\n';
  // Home link
  if (homePage) {
    const homeCls = (!activeDir && activeFile === 'index') ? ' class="active"' : '';
    html += `<a href="${prefix}index.html"${homeCls}>${homePage.title}</a>\n`;
  }
  for (const section of sections) {
    html += '<details class="nav-section" open>\n';
    html += `<summary>${section.title}</summary>\n`;
    for (const item of section.items) {
      const href = `${prefix}${item.href}`;
      const cls = (item.dir === activeDir && item.name === activeFile) ? ' class="active"' : '';
      html += `<a href="${href}"${cls}>${item.title}</a>\n`;
    }
    html += '</details>\n';
  }
  // Standalone pages at the bottom of the sidebar
  if (standalonePages && standalonePages.length > 0) {
    html += '<div class="nav-standalone">\n';
    for (const page of standalonePages) {
      const href = `${prefix}${page.href}`;
      const cls = (!activeDir && activeFile === page.name) ? ' class="active"' : '';
      html += `<a href="${href}"${cls}>${page.title}</a>\n`;
    }
    html += '</div>\n';
  }
  html += '</div>\n</nav>';
  return html;
}

function buildSearchIndex(docsDir, sections, { homePage, standalonePages } = {}) {
  const index = [];
  // Index root home page
  if (homePage) {
    const raw = fs.readFileSync(path.join(docsDir, 'index.md'), 'utf-8');
    const { body } = parseFrontmatter(raw);
    const preview = body.replace(/^#+\s+.+$/gm, '').replace(/[`*_\[\]()#>|\\-]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);
    index.push({ title: homePage.title, href: homePage.href, preview });
  }
  for (const section of sections) {
    for (const item of section.items) {
      const raw = fs.readFileSync(path.join(docsDir, item.dir, `${item.name}.md`), 'utf-8');
      const { body } = parseFrontmatter(raw);
      const preview = body.replace(/^#+\s+.+$/gm, '').replace(/[`*_\[\]()#>|\\-]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);
      index.push({ title: item.title, href: item.href, preview });
    }
  }
  // Index standalone pages
  if (standalonePages) {
    for (const page of standalonePages) {
      const raw = fs.readFileSync(path.join(docsDir, `${page.name}.md`), 'utf-8');
      const { body } = parseFrontmatter(raw);
      const preview = body.replace(/^#+\s+.+$/gm, '').replace(/[`*_\[\]()#>|\\-]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);
      index.push({ title: page.title, href: page.href, preview });
    }
  }
  return index;
}

// Rewrite .md links to .html in rendered HTML
function rewriteLinks(html) {
  return html.replace(/href="([^"]*?)\.md(#[^"]*)?"/g, (_, base, hash) => {
    return `href="${base}.html${hash || ''}"`;
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function build() {
  const docsDir = __dirname;
  const distDir = path.join(__dirname, 'dist');
  const templatePath = path.join(__dirname, 'template.html');
  const assetsDir = path.join(__dirname, 'assets');

  // Clean and create dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // Copy assets into dist/
  if (fs.existsSync(assetsDir)) {
    copyDirSync(assetsDir, path.join(distDir, 'assets'));
  }

  // Copy highlight.js CSS theme into dist/assets/
  const hljsCssDir = path.join(distDir, 'assets');
  const hljsStylesRoot = path.dirname(fileURLToPath(import.meta.resolve('highlight.js/styles/github-dark.css')));
  fs.copyFileSync(path.join(hljsStylesRoot, 'github-dark.css'), path.join(hljsCssDir, 'hljs-dark.css'));
  fs.copyFileSync(path.join(hljsStylesRoot, 'github.css'), path.join(hljsCssDir, 'hljs-light.css'));

  const template = fs.readFileSync(templatePath, 'utf-8');
  const sections = discoverDocs(docsDir);
  const homePage = discoverHomePage(docsDir);
  const standalonePages = discoverStandalonePages(docsDir);
  const navExtras = { homePage, standalonePages };
  const searchIndex = buildSearchIndex(docsDir, sections, navExtras);
  const searchIndexJson = JSON.stringify(searchIndex);

  let totalFiles = 0;

  // Render root index.md as dist/index.html (home page)
  if (homePage) {
    const raw = fs.readFileSync(path.join(docsDir, 'index.md'), 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const title = meta.title || extractTitle(body) || 'Home';
    let content = md.render(body);
    content = rewriteLinks(content);
    const navHtml = buildNavHtml(sections, '', 'index', navExtras);
    const html = template
      .replace('{{TITLE}}', title)
      .replace('{{CONTENT}}', content)
      .replace('{{NAV}}', navHtml)
      .replace('{{SEARCH_INDEX}}', searchIndexJson)
      .replace(/href="assets\//g, 'href="assets/')
      .replace(/src="assets\//g, 'src="assets/');
    fs.writeFileSync(path.join(distDir, 'index.html'), html);
    console.log('✓ Generated index.html (home)');
    totalFiles++;
  }

  for (const section of sections) {
    for (const item of section.items) {
      const mdPath = path.join(docsDir, item.dir, `${item.name}.md`);
      const outDir = path.join(distDir, item.dir);
      const htmlPath = path.join(outDir, `${item.name}.html`);

      fs.mkdirSync(outDir, { recursive: true });

      const raw = fs.readFileSync(mdPath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title = meta.title || extractTitle(body) || titleFromFilename(`${item.name}.md`);
      let content = md.render(body);
      content = rewriteLinks(content);

      const navHtml = buildNavHtml(sections, item.dir, item.name, navExtras);
      const prefix = assetsPrefix(item.dir);

      const html = template
        .replace('{{TITLE}}', title)
        .replace('{{CONTENT}}', content)
        .replace('{{NAV}}', navHtml)
        .replace('{{SEARCH_INDEX}}', searchIndexJson)
        .replace(/href="assets\//g, `href="${prefix}assets/`)
        .replace(/src="assets\//g, `src="${prefix}assets/`);

      fs.writeFileSync(htmlPath, html);
      console.log(`✓ Generated ${item.dir}/${item.name}.html`);
      totalFiles++;
    }
  }

  // Render standalone pages (e.g. whatsnew.md) into dist root
  for (const page of standalonePages) {
    const raw = fs.readFileSync(path.join(docsDir, `${page.name}.md`), 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const title = meta.title || extractTitle(body) || titleFromFilename(`${page.name}.md`);
    let content = md.render(body);
    content = rewriteLinks(content);
    const navHtml = buildNavHtml(sections, '', page.name, navExtras);
    const html = template
      .replace('{{TITLE}}', title)
      .replace('{{CONTENT}}', content)
      .replace('{{NAV}}', navHtml)
      .replace('{{SEARCH_INDEX}}', searchIndexJson)
      .replace(/href="assets\//g, 'href="assets/')
      .replace(/src="assets\//g, 'src="assets/');
    fs.writeFileSync(path.join(distDir, `${page.name}.html`), html);
    console.log(`✓ Generated ${page.name}.html`);
    totalFiles++;
  }

  // Fallback: if no home page from index.md, redirect to first section
  if (!homePage) {
    const firstSection = sections[0];
    const fallbackTarget = firstSection ? `${firstSection.dir}/${firstSection.items[0]?.name || 'index'}.html` : 'index.html';
    const redirectHtml = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${fallbackTarget}"><title>Redirecting...</title></head><body><p>Redirecting to <a href="${fallbackTarget}">documentation</a>...</p></body></html>`;
    fs.writeFileSync(path.join(distDir, 'index.html'), redirectHtml);
    console.log('✓ Generated index.html (redirect)');
  }

  console.log(`\n✅ Docs site generated in ${distDir} (${totalFiles} pages)`);
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
