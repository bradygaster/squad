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
  nav += '  <div class="sidebar-header"><a href="/index.html" class="logo">Squad</a>';
  nav += '<button class="sidebar-close" onclick="toggleSidebar()">X</button></div>\n';
  nav += '  <div class="sidebar-content">\n';
  topLevel.sort(fileSorter);
  for (var j = 0; j < topLevel.length; j++) {
    var tf = topLevel[j];
    var href = '/' + toHtmlPath(tf.rel);
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
      var shref = '/' + toHtmlPath(sf.rel);
      var stitle = extractTitle(sf.abs) || nameFromFile(sf.rel);
      var sactive = sf.rel === currentRel ? ' class="active"' : '';
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

function build() {
  var files = walk(DOCS_DIR);
  console.log('Found ' + files.length + ' markdown files');
  var searchIndex = files.map(function(f) {
    var raw = fs.readFileSync(f.abs, 'utf8');
    var title = extractTitle(f.abs) || nameFromFile(f.rel);
    var preview = raw.replace(/^---[\s\S]*?---\n?/, '').replace(/[#*`>\[\]|_~\-]/g, '').replace(/\n+/g, ' ').trim().substring(0, 200);
    return { title: title, href: '/' + toHtmlPath(f.rel), preview: preview };
  });
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var raw = fs.readFileSync(f.abs, 'utf8');
    var stripped = raw.replace(/^---\s*\n[\s\S]*?---\s*\n/, '');
    var rendered = md.render(stripped);
    var rewritten = rewriteLinks(rendered);
    var title = extractTitle(f.abs) || nameFromFile(f.rel);
    var nav = buildNav(files, f.rel);
    var html = getTemplate(title, rewritten, nav, searchIndex);
    var outPath = path.join(OUT_DIR, toHtmlPath(f.rel));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
  }
  var assetsDir = path.join(DOCS_DIR, 'assets');
  if (fs.existsSync(assetsDir)) copyDir(assetsDir, path.join(OUT_DIR, 'assets'));
  console.log('Built ' + files.length + ' pages to ' + OUT_DIR);
}

function getTemplate(title, content, nav, searchIndex) {
  return '<!DOCTYPE html>\n<html lang="en" data-theme="auto">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + escapeHtml(title) + ' - Squad Docs</title>\n' +
    '<style>\n' + getCSS() + '\n</style>\n</head>\n<body>\n<div class="layout">\n' +
    nav + '\n<div class="main">\n' +
    '<div class="topbar">\n' +
    '<button class="menu-btn" onclick="toggleSidebar()">&#9776;</button>\n' +
    '<div class="search-box"><input type="text" id="search" placeholder="Search docs..." autocomplete="off">' +
    '<div class="search-results" id="search-results"></div></div>\n' +
    '<button class="theme-toggle" onclick="toggleTheme()" id="theme-btn"></button>\n' +
    '</div>\n<article class="content">\n' + content + '\n</article>\n</div>\n</div>\n' +
    '<script>\nvar searchIndex = ' + JSON.stringify(searchIndex) + ';\n' + getJS() + '\n</script>\n</body>\n</html>';
}

function getCSS() {
  return [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    ':root { --bg:#fff; --bg2:#f6f8fa; --text:#1f2328; --muted:#656d76; --border:#d1d9e0;',
    '  --accent:#0969da; --accent2:#ddf4ff; --code-bg:#f6f8fa; --code-border:#d1d9e0;',
    '  --sidebar-bg:#f6f8fa; --sidebar-w:280px; --shadow:0 1px 3px rgba(0,0,0,.08); --radius:8px; }',
    '@media(prefers-color-scheme:dark){ :root:not([data-theme="light"]){',
    '  --bg:#0d1117; --bg2:#161b22; --text:#e6edf3; --muted:#8b949e; --border:#30363d;',
    '  --accent:#58a6ff; --accent2:#1a3a5c; --code-bg:#161b22; --code-border:#30363d;',
    '  --sidebar-bg:#161b22; --shadow:0 1px 3px rgba(0,0,0,.3); } }',
    '[data-theme="dark"]{ --bg:#0d1117; --bg2:#161b22; --text:#e6edf3; --muted:#8b949e; --border:#30363d;',
    '  --accent:#58a6ff; --accent2:#1a3a5c; --code-bg:#161b22; --code-border:#30363d;',
    '  --sidebar-bg:#161b22; --shadow:0 1px 3px rgba(0,0,0,.3); }',
    'body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Noto Sans,Helvetica,Arial,sans-serif;',
    '  font-size:16px; line-height:1.6; color:var(--text); background:var(--bg); }',
    '.layout { display:flex; min-height:100vh; }',
    '.sidebar { width:var(--sidebar-w); background:var(--sidebar-bg); border-right:1px solid var(--border);',
    '  position:fixed; top:0; left:0; bottom:0; overflow-y:auto; z-index:100; display:flex; flex-direction:column; }',
    '.sidebar-header { padding:20px 16px 12px; border-bottom:1px solid var(--border);',
    '  display:flex; align-items:center; justify-content:space-between; }',
    '.sidebar-header .logo { font-size:20px; font-weight:700; color:var(--text); text-decoration:none; }',
    '.sidebar-close { display:none; background:none; border:none; font-size:20px; color:var(--muted); cursor:pointer; }',
    '.sidebar-content { padding:12px 0; flex:1; overflow-y:auto; }',
    '.sidebar-content>a, .nav-section a { display:block; padding:6px 16px; color:var(--muted);',
    '  text-decoration:none; font-size:14px; border-left:3px solid transparent; transition:all .15s; }',
    '.sidebar-content>a:hover, .nav-section a:hover { color:var(--text); background:var(--accent2); }',
    '.sidebar-content>a.active, .nav-section a.active { color:var(--accent); border-left-color:var(--accent); font-weight:600; }',
    '.nav-section { margin:4px 0; }',
    '.nav-section summary { padding:6px 16px; font-size:12px; font-weight:600; text-transform:uppercase;',
    '  letter-spacing:.05em; color:var(--muted); cursor:pointer; list-style:none; user-select:none; }',
    '.nav-section summary::before { content:"\\25B8 "; }',
    '.nav-section[open] summary::before { content:"\\25BE "; }',
    '.nav-section summary::-webkit-details-marker { display:none; }',
    '.nav-section a { padding-left:28px; }',
    '.main { margin-left:var(--sidebar-w); flex:1; min-width:0; }',
    '.topbar { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--border);',
    '  padding:8px 24px; display:flex; align-items:center; justify-content:space-between; z-index:50; }',
    '.menu-btn { display:none; background:none; border:1px solid var(--border); border-radius:6px;',
    '  padding:4px 10px; font-size:18px; cursor:pointer; color:var(--text); }',
    '.search-box { flex:1; max-width:400px; position:relative; }',
    '.search-box input { width:100%; padding:6px 12px; border:1px solid var(--border); border-radius:6px;',
    '  background:var(--bg2); color:var(--text); font-size:14px; outline:none; }',
    '.search-box input:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent2); }',
    '.search-results { position:absolute; top:100%; left:0; right:0; background:var(--bg);',
    '  border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow);',
    '  max-height:400px; overflow-y:auto; display:none; z-index:200; }',
    '.search-results.visible { display:block; }',
    '.search-results a { display:block; padding:8px 12px; color:var(--text); text-decoration:none;',
    '  font-size:14px; border-bottom:1px solid var(--border); }',
    '.search-results a:hover { background:var(--accent2); }',
    '.search-results a:last-child { border-bottom:none; }',
    '.search-results .no-results { padding:12px; color:var(--muted); font-size:14px; }',
    '.theme-toggle { background:none; border:1px solid var(--border); border-radius:6px;',
    '  padding:4px 10px; font-size:18px; cursor:pointer; margin-left:12px; color:var(--text); }',
    '.content { max-width:820px; margin:0 auto; padding:32px 40px 80px; }',
    '.content h1 { font-size:2em; margin:0 0 16px; border-bottom:1px solid var(--border); padding-bottom:8px; }',
    '.content h2 { font-size:1.5em; margin:32px 0 12px; border-bottom:1px solid var(--border); padding-bottom:6px; }',
    '.content h3 { font-size:1.25em; margin:24px 0 8px; }',
    '.content h4 { font-size:1em; margin:20px 0 6px; }',
    '.content p { margin:0 0 16px; }',
    '.content ul, .content ol { margin:0 0 16px; padding-left:2em; }',
    '.content li { margin:4px 0; }',
    '.content li>p { margin:4px 0; }',
    '.content a { color:var(--accent); text-decoration:none; }',
    '.content a:hover { text-decoration:underline; }',
    '.content blockquote { margin:0 0 16px; padding:8px 16px; border-left:4px solid var(--accent);',
    '  background:var(--bg2); border-radius:0 var(--radius) var(--radius) 0; color:var(--muted); }',
    '.content table { width:100%; border-collapse:collapse; margin:0 0 16px; font-size:14px; }',
    '.content th, .content td { padding:8px 12px; border:1px solid var(--border); text-align:left; }',
    '.content th { background:var(--bg2); font-weight:600; }',
    '.content code { font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;',
    '  font-size:.875em; background:var(--code-bg); border:1px solid var(--code-border); border-radius:4px; padding:2px 6px; }',
    '.content pre { margin:0 0 16px; padding:16px; background:var(--code-bg); border:1px solid var(--code-border);',
    '  border-radius:var(--radius); overflow-x:auto; font-size:14px; line-height:1.5; }',
    '.content pre code { background:none; border:none; padding:0; font-size:inherit; }',
    '.content img { max-width:100%; border-radius:var(--radius); }',
    '.content hr { border:none; border-top:1px solid var(--border); margin:32px 0; }',
    '@media(max-width:768px){',
    '  .sidebar { transform:translateX(-100%); transition:transform .25s ease; width:280px; }',
    '  .sidebar.open { transform:translateX(0); box-shadow:4px 0 20px rgba(0,0,0,.2); }',
    '  .sidebar-close { display:block; }',
    '  .main { margin-left:0; }',
    '  .menu-btn { display:block; }',
    '  .content { padding:24px 16px 60px; } }',
    '@media print { .sidebar, .topbar { display:none !important; } .main { margin-left:0; } }'
  ].join('\n');
}

function getJS() {
  return [
    '(function(){',
    '  var saved=localStorage.getItem("squad-theme");',
    '  if(saved) document.documentElement.setAttribute("data-theme",saved);',
    '  updateThemeBtn();',
    '})();',
    'function toggleTheme(){',
    '  var html=document.documentElement;',
    '  var c=html.getAttribute("data-theme");',
    '  var n=c==="dark"?"light":c==="light"?"auto":"dark";',
    '  html.setAttribute("data-theme",n);',
    '  localStorage.setItem("squad-theme",n);',
    '  updateThemeBtn();',
    '}',
    'function updateThemeBtn(){',
    '  var t=document.documentElement.getAttribute("data-theme");',
    '  var b=document.getElementById("theme-btn");',
    '  if(!b) return;',
    '  b.textContent=t==="dark"?"\\u2600\\uFE0F":t==="light"?"\\uD83C\\uDF19":"\\uD83D\\uDCBB";',
    '}',
    'function toggleSidebar(){',
    '  document.getElementById("sidebar").classList.toggle("open");',
    '}',
    '(function(){',
    '  var input=document.getElementById("search");',
    '  var results=document.getElementById("search-results");',
    '  function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }',
    '  input.addEventListener("input",function(){',
    '    var q=this.value.toLowerCase().trim();',
    '    if(q.length<2){ results.classList.remove("visible"); return; }',
    '    var matches=searchIndex.filter(function(e){',
    '      return e.title.toLowerCase().indexOf(q)!==-1 || e.preview.toLowerCase().indexOf(q)!==-1;',
    '    }).slice(0,10);',
    '    if(!matches.length){ results.innerHTML=\'<div class="no-results">No results</div>\'; }',
    '    else { results.innerHTML=matches.map(function(m){',
    '      return \'<a href="\'+m.href+\'"><strong>\'+esc(m.title)+\'</strong><br><small>\'+esc(m.preview.substring(0,100))+\'</small></a>\';',
    '    }).join(""); }',
    '    results.classList.add("visible");',
    '  });',
    '  input.addEventListener("blur",function(){ setTimeout(function(){ results.classList.remove("visible"); },200); });',
    '  input.addEventListener("keydown",function(e){ if(e.key==="Escape"){ this.value=""; results.classList.remove("visible"); } });',
    '})();'
  ].join('\n');
}

build();
