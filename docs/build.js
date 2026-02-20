#!/usr/bin/env node
// Squad docs site builder - converts docs/**/*.md to static HTML.
// Dependencies: markdown-it, markdown-it-anchor
// Run: node docs/build.js [--out _site]

const fs = require('fs');
const path = require('path');
const markdownIt = require('markdown-it');
const markdownItAnchor = require('markdown-it-anchor');

const DOCS_DIR = path.join(__dirname);
const OUT_DIR = process.argv.includes('--out')
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
  : path.join(__dirname, '..', '_site');

// Base path prefix for deployment under a subpath (e.g., /squad for GitHub Pages)
const BASE_PATH = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1].replace(/\/+$/, '')
  : '';

const md = markdownIt({ html: true, linkify: true, typographer: true })
  .use(markdownItAnchor, { permalink: false });

function walk(dir, base) {
  base = base || dir;
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'assets' && entry.name !== 'node_modules') {
      results = results.concat(walk(full, base));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'build.js') {
      results.push({ abs: full, rel: path.relative(base, full) });
    }
  }
  return results;
}

function toHtmlPath(rel) {
  return rel.replace(/\\/g, '/').replace(/README\.md$/i, 'index.html').replace(/\.md$/, '.html');
}

function extractTitle(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fmMatch = content.match(/^---\s*\n[\s\S]*?title:\s*"?([^"\n]+)"?\s*\n[\s\S]*?---/);
  if (fmMatch) return fmMatch[1].trim();
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return null;
}

function extractDate(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fmMatch = content.match(/^---\s*\n[\s\S]*?date:\s*(\d{4}-\d{2}-\d{2})/);
  if (fmMatch) return fmMatch[1];
  return null;
}

function nameFromFile(rel) {
  const base = path.basename(rel, '.md');
  if (base.toLowerCase() === 'readme') return 'Overview';
  return base.replace(/[-_]/g, ' ').replace(/^\d+-/, '').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function fileSorter(a, b) {
  var nameA = path.basename(a.rel).toLowerCase();
  var nameB = path.basename(b.rel).toLowerCase();
  if (nameA === 'readme.md') return -1;
  if (nameB === 'readme.md') return 1;
  return nameA.localeCompare(nameB);
}

function stripFrontmatter(raw) {
  return raw.replace(/^---\s*\n[\s\S]*?---\s*\n/, '');
}

function toMarkdownCompanionPath(rel) {
  return toHtmlPath(rel) + '.md';
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildNav(files, currentRel) {
  var sections = {};
  var topLevel = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var parts = f.rel.replace(/\\/g, '/').split('/');
    if (parts.length === 1) topLevel.push(f);
    else {
      var section = parts[0];
      if (!sections[section]) sections[section] = [];
      sections[section].push(f);
    }
  }
  var sectionLabels = { features: 'Features', scenarios: 'Scenarios', blog: 'Blog' };
  var nav = '<nav class="sidebar" id="sidebar">\n';
  nav += '  <div class="sidebar-header"><a href="' + BASE_PATH + '/index.html" class="logo"><img src="' + BASE_PATH + '/assets/squad-logo.png" alt="Squad" class="sidebar-logo-img"></a>';
  nav += '<button class="sidebar-close" onclick="toggleSidebar()">X</button></div>\n';
  nav += '  <div class="sidebar-content">\n';
  topLevel.sort(fileSorter);
  for (var j = 0; j < topLevel.length; j++) {
    var tf = topLevel[j];
    var href = BASE_PATH + '/' + toHtmlPath(tf.rel);
    var title = extractTitle(tf.abs) || nameFromFile(tf.rel);
    var active = tf.rel === currentRel ? ' class="active"' : '';
    nav += '    <a href="' + href + '"' + active + '>' + escapeHtml(title) + '</a>\n';
  }
  var sectionOrder = ['features', 'scenarios', 'blog'];
  var remaining = Object.keys(sections).filter(function(s) { return sectionOrder.indexOf(s) === -1; });
  var allSections = sectionOrder.concat(remaining);
  for (var k = 0; k < allSections.length; k++) {
    var sec = allSections[k];
    if (!sections[sec]) continue;
    var label = sectionLabels[sec] || sec.charAt(0).toUpperCase() + sec.slice(1);
    var isActive = currentRel.replace(/\\/g, '/').startsWith(sec + '/');
    nav += '    <details class="nav-section"' + (isActive ? ' open' : '') + '>\n';
    nav += '      <summary>' + label + '</summary>\n';
    sections[sec].sort(fileSorter);
    for (var m = 0; m < sections[sec].length; m++) {
      var sf = sections[sec][m];
      var shref = BASE_PATH + '/' + toHtmlPath(sf.rel);
      var stitle = extractTitle(sf.abs) || nameFromFile(sf.rel);
      var sactive = sf.rel === currentRel ? ' class="active"' : '';
      // Show date for blog posts
      if (sec === 'blog') {
        var sdate = extractDate(sf.abs);
        if (sdate) stitle += ' (' + sdate + ')';
      }
      nav += '      <a href="' + shref + '"' + sactive + '>' + escapeHtml(stitle) + '</a>\n';
    }
    nav += '    </details>\n';
  }
  nav += '  </div>\n</nav>';
  return nav;
}

function rewriteLinks(html) {
  return html
    .replace(/href="([^"]*?)README\.md"/g, 'href="$1index.html"')
    .replace(/href="([^"]*?)\.md"/g, 'href="$1.html"')
    .replace(/href="([^"]*?)\.md#/g, 'href="$1.html#');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    var s = path.join(src, entry.name);
    var d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function extractFirstLine(abs) {
  var raw = fs.readFileSync(abs, 'utf8');
  var body = stripFrontmatter(raw);
  var lines = body.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('---') || line.startsWith('!') || line.startsWith('[')) continue;
    if (line.startsWith('|') || line.startsWith('```')) continue;

    line = line
      .replace(/^>\s*/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (line) {
      if (line.length > 200) return line.substring(0, 197).trimEnd() + '...';
      return line;
    }
  }
  return '';
}

function generateLlmsTxt(files) {
  var lines = [];
  lines.push('# Squad');
  lines.push('');
  lines.push('> AI agent teams for any project. A team that grows with your code.');
  lines.push('');
  lines.push('Squad gives you an AI development team through GitHub Copilot. Describe what you\'re building. Get a team of specialists that live in your repo as files, persist across sessions, learn your codebase, and share decisions.');
  lines.push('');

  var sections = { guides: [], features: [], scenarios: [], blog: [] };
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var rel = f.rel.replace(/\\/g, '/');
    if (rel.startsWith('features/')) sections.features.push(f);
    else if (rel.startsWith('scenarios/')) sections.scenarios.push(f);
    else if (rel.startsWith('blog/')) sections.blog.push(f);
    else sections.guides.push(f);
  }

  var sectionDefs = [
    { key: 'guides', label: 'Guides' },
    { key: 'features', label: 'Features' },
    { key: 'scenarios', label: 'Scenarios' },
    { key: 'blog', label: 'Optional' }
  ];

  for (var s = 0; s < sectionDefs.length; s++) {
    var sec = sectionDefs[s];
    var items = sections[sec.key];
    if (!items.length) continue;
    items.sort(fileSorter);
    lines.push('## ' + sec.label);
    lines.push('');
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var title = extractTitle(item.abs) || nameFromFile(item.rel);
      var mdPath = toMarkdownCompanionPath(item.rel);
      var url = BASE_PATH + '/' + mdPath;
      var desc = extractFirstLine(item.abs);
      var entry = '- [' + title + '](' + url + ')';
      if (desc) entry += ': ' + desc;
      lines.push(entry);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateLlmsFullTxt(files) {
  var parts = [];
  parts.push('# Squad — Complete Documentation');
  parts.push('');

  var included = files.slice();
  included.sort(fileSorter);

  for (var i = 0; i < included.length; i++) {
    var f = included[i];
    var raw = fs.readFileSync(f.abs, 'utf8');
    var body = stripFrontmatter(raw).trim();
    parts.push('---');
    parts.push('');
    parts.push('Source: ' + f.rel.replace(/\\/g, '/'));
    parts.push('');
    parts.push(body);
    parts.push('');
  }

  return parts.join('\n');
}

function copyMarkdownFiles(files) {
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var raw = fs.readFileSync(f.abs, 'utf8');
    var body = stripFrontmatter(raw);
    var companionPath = path.join(OUT_DIR, toMarkdownCompanionPath(f.rel));
    fs.mkdirSync(path.dirname(companionPath), { recursive: true });
    fs.writeFileSync(companionPath, body);
  }
}

function build() {
  var files = walk(DOCS_DIR);
  console.log('Found ' + files.length + ' markdown files');
  var searchIndex = files.map(function(f) {
    var raw = fs.readFileSync(f.abs, 'utf8');
    var title = extractTitle(f.abs) || nameFromFile(f.rel);
    var preview = raw.replace(/^---[\s\S]*?---\n?/, '').replace(/[#*`>\[\]|_~\-]/g, '').replace(/\n+/g, ' ').trim().substring(0, 200);
    return { title: title, href: BASE_PATH + '/' + toHtmlPath(f.rel), preview: preview };
  });
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var raw = fs.readFileSync(f.abs, 'utf8');
    var stripped = stripFrontmatter(raw);
    var rendered = md.render(stripped);
    var rewritten = rewriteLinks(rendered);
    var title = extractTitle(f.abs) || nameFromFile(f.rel);
    var nav = buildNav(files, f.rel);
    var html = getTemplate(title, rewritten, nav, searchIndex);
    var outPath = path.join(OUT_DIR, toHtmlPath(f.rel));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'llms.txt'), generateLlmsTxt(files));
  fs.writeFileSync(path.join(OUT_DIR, 'llms-full.txt'), generateLlmsFullTxt(files));
  copyMarkdownFiles(files);
  console.log('Generated llms.txt, llms-full.txt, and markdown companions');
  var assetsDir = path.join(DOCS_DIR, 'assets');
  if (fs.existsSync(assetsDir)) copyDir(assetsDir, path.join(OUT_DIR, 'assets'));
  console.log('Built ' + files.length + ' pages to ' + OUT_DIR);
}

// Read template files from docs/assets/
var TEMPLATE_HTML = fs.readFileSync(path.join(DOCS_DIR, 'assets', 'template.html'), 'utf8');

function getTemplate(title, content, nav, searchIndex) {
  return TEMPLATE_HTML
    .replace('{{title}}', escapeHtml(title))
    .replace('{{nav}}', nav)
    .replace('{{content}}', content)
    .replace('{{searchIndex}}', JSON.stringify(searchIndex))
    .replace(/\{\{basePath\}\}/g, BASE_PATH);
}

build();
