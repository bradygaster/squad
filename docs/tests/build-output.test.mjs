/**
 * Build output tests for Phase 1 search improvements.
 * Validates that pagefind attributes are correctly applied in the built HTML.
 * Run with: node --test tests/build-output.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DOCS_ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(DOCS_ROOT, 'dist');

// Collect HTML files from dist for reuse across tests
function findHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '_astro' && entry.name !== 'pagefind') {
      findHtmlFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

const allHtmlFiles = findHtmlFiles(DIST);

// Exclude top-level pages (404, home, blog index) which use different layouts
const EXCLUDED_PAGES = ['404.html', `blog${path.sep}index.html`, 'index.html'];
function isContentPage(file) {
  const rel = path.relative(DIST, file);
  return !EXCLUDED_PAGES.some(exc => rel === exc || rel === exc.replace(/\//g, path.sep));
}

const docsHtmlFiles = allHtmlFiles.filter(f =>
  f.includes(`${path.sep}docs${path.sep}`) && isContentPage(f)
);
const blogHtmlFiles = allHtmlFiles.filter(f =>
  f.includes(`${path.sep}blog${path.sep}`) && isContentPage(f)
);

// ── pagefind.yml ──────────────────────────────────────────────────────────────

describe('pagefind.yml configuration', () => {
  it('exists in the docs root', () => {
    assert.ok(
      fs.existsSync(path.join(DOCS_ROOT, 'pagefind.yml')),
      'pagefind.yml should exist at docs root'
    );
  });

  it('contains exclude_selectors for nav, footer, aside, pre, .astro-code', () => {
    const content = fs.readFileSync(path.join(DOCS_ROOT, 'pagefind.yml'), 'utf-8');
    for (const selector of ['nav', 'footer', 'aside', 'pre', '.astro-code']) {
      assert.ok(
        content.includes(`"${selector}"`) || content.includes(`'${selector}'`) || content.includes(`- ${selector}`) || content.includes(`- "${selector}"`),
        `pagefind.yml should exclude selector: ${selector}`
      );
    }
  });
});

// ── Pagefind index output ─────────────────────────────────────────────────────

describe('pagefind build output', () => {
  it('pagefind directory exists in dist/', () => {
    assert.ok(
      fs.existsSync(path.join(DIST, 'pagefind')),
      'dist/pagefind/ directory should exist after build'
    );
  });

  it('pagefind.js is present in pagefind directory', () => {
    assert.ok(
      fs.existsSync(path.join(DIST, 'pagefind', 'pagefind.js')),
      'dist/pagefind/pagefind.js should exist'
    );
  });
});

// ── data-pagefind-body on article elements ────────────────────────────────────

describe('data-pagefind-body attribute', () => {
  it('docs pages contain data-pagefind-body on article elements', () => {
    assert.ok(docsHtmlFiles.length > 0, 'Should have docs HTML files to test');
    const missing = [];
    for (const file of docsHtmlFiles) {
      const html = fs.readFileSync(file, 'utf-8');
      if (!html.includes('data-pagefind-body')) {
        missing.push(path.relative(DIST, file));
      }
    }
    assert.equal(missing.length, 0, `These docs pages lack data-pagefind-body: ${missing.join(', ')}`);
  });

  it('blog post pages contain data-pagefind-body on article elements', () => {
    assert.ok(blogHtmlFiles.length > 0, 'Should have blog HTML files to test');
    for (const file of blogHtmlFiles) {
      const html = fs.readFileSync(file, 'utf-8');
      assert.ok(
        html.includes('data-pagefind-body'),
        `Blog page missing data-pagefind-body: ${path.relative(DIST, file)}`
      );
    }
  });
});

// ── data-pagefind-meta with section values ────────────────────────────────────

describe('data-pagefind-meta section attribute', () => {
  it('docs pages have data-pagefind-meta with a section value', () => {
    assert.ok(docsHtmlFiles.length > 0, 'Should have docs HTML files to test');
    const sectionPattern = /data-pagefind-meta="section:([^"]+)"/;
    const missing = [];
    for (const file of docsHtmlFiles) {
      const html = fs.readFileSync(file, 'utf-8');
      if (!sectionPattern.test(html)) {
        missing.push(path.relative(DIST, file));
      }
    }
    assert.equal(
      missing.length, 0,
      `These docs pages lack data-pagefind-meta section: ${missing.join(', ')}`
    );
  });

  it('section values match expected categories', () => {
    const knownSections = new Set([
      'Get Started', 'Guide', 'Features', 'Reference',
      'Scenarios', 'Concepts', 'Cookbook', 'Blog', 'Docs', 'Community'
    ]);
    const sectionPattern = /data-pagefind-meta="section:([^"]+)"/g;
    const foundSections = new Set();
    for (const file of [...docsHtmlFiles, ...blogHtmlFiles]) {
      const html = fs.readFileSync(file, 'utf-8');
      for (const match of html.matchAll(sectionPattern)) {
        foundSections.add(match[1]);
      }
    }
    assert.ok(foundSections.size > 0, 'Should find at least one section value');
    for (const section of foundSections) {
      assert.ok(
        knownSections.has(section),
        `Unexpected section value "${section}" — expected one of: ${[...knownSections].join(', ')}`
      );
    }
  });

  it('blog pages have section:Blog', () => {
    assert.ok(blogHtmlFiles.length > 0, 'Should have blog HTML files to test');
    for (const file of blogHtmlFiles) {
      const html = fs.readFileSync(file, 'utf-8');
      assert.ok(
        html.includes('data-pagefind-meta="section:Blog"'),
        `Blog page missing section:Blog — ${path.relative(DIST, file)}`
      );
    }
  });
});

// ── data-pagefind-weight on headings ──────────────────────────────────────────

describe('data-pagefind-weight on headings', () => {
  it('docs pages have data-pagefind-weight="2" on h2 or h3 elements inside article', () => {
    const weightPattern = /<h[23][^>]*data-pagefind-weight="2"/;
    // Only check pages that have h2/h3 inside a prose article (standard content pages)
    const articleHeadingPattern = /data-pagefind-body[\s\S]*?<h[23][\s>]/;
    const pagesWithArticleHeadings = docsHtmlFiles.filter(f => {
      const html = fs.readFileSync(f, 'utf-8');
      return articleHeadingPattern.test(html);
    });
    assert.ok(pagesWithArticleHeadings.length > 0, 'Should have docs pages with h2/h3 inside article');

    const missing = [];
    for (const file of pagesWithArticleHeadings) {
      const html = fs.readFileSync(file, 'utf-8');
      if (!weightPattern.test(html)) {
        missing.push(path.relative(DIST, file));
      }
    }
    assert.equal(
      missing.length, 0,
      `These pages with article headings lack data-pagefind-weight="2": ${missing.join(', ')}`
    );
  });
});

// ── data-pagefind-ignore on nav, footer, pre ──────────────────────────────────

describe('data-pagefind-ignore attributes', () => {
  // Use one representative docs page that has all elements
  const sampleFile = docsHtmlFiles.find(f => f.includes('built-in-roles'));
  const sampleHtml = sampleFile ? fs.readFileSync(sampleFile, 'utf-8') : '';

  it('nav elements have data-pagefind-ignore', () => {
    assert.ok(sampleFile, 'Sample file (built-in-roles) should exist');
    const navTags = [...sampleHtml.matchAll(/<nav[^>]*>/g)].map(m => m[0]);
    assert.ok(navTags.length > 0, 'Page should contain nav elements');
    for (const tag of navTags) {
      assert.ok(
        tag.includes('data-pagefind-ignore'),
        `nav element missing data-pagefind-ignore: ${tag.substring(0, 80)}`
      );
    }
  });

  it('footer elements have data-pagefind-ignore', () => {
    assert.ok(sampleFile, 'Sample file should exist');
    const footerTags = [...sampleHtml.matchAll(/<footer[^>]*>/g)].map(m => m[0]);
    assert.ok(footerTags.length > 0, 'Page should contain footer elements');
    for (const tag of footerTags) {
      assert.ok(
        tag.includes('data-pagefind-ignore'),
        `footer element missing data-pagefind-ignore: ${tag.substring(0, 80)}`
      );
    }
  });

  it('pre (code block) elements have data-pagefind-ignore', () => {
    assert.ok(sampleFile, 'Sample file should exist');
    const preTags = [...sampleHtml.matchAll(/<pre[^>]*>/g)].map(m => m[0]);
    assert.ok(preTags.length > 0, 'Page should contain pre elements');
    for (const tag of preTags) {
      assert.ok(
        tag.includes('data-pagefind-ignore'),
        `pre element missing data-pagefind-ignore: ${tag.substring(0, 80)}`
      );
    }
  });
});
