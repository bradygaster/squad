/**
 * Astro feature tests — validates 10 PAO audit items are implemented.
 * Run with: node --test tests/astro-features.test.mjs
 * NOTE: Build-output tests require npm run build to have run first.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DOCS_ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(DOCS_ROOT, 'src');
const DIST = path.join(DOCS_ROOT, 'dist');

// 1. sitemap
describe('sitemap integration', () => {
  it('package.json includes @astrojs/sitemap dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DOCS_ROOT, 'package.json'), 'utf-8'));
    assert.ok(pkg.dependencies?.['@astrojs/sitemap'] || pkg.devDependencies?.['@astrojs/sitemap'], '@astrojs/sitemap should be in package.json');
  });
  it('astro.config.mjs imports and registers sitemap integration', () => {
    const config = fs.readFileSync(path.join(DOCS_ROOT, 'astro.config.mjs'), 'utf-8');
    assert.ok(config.includes('@astrojs/sitemap'), 'config should import @astrojs/sitemap');
    assert.ok(config.includes('sitemap()') || config.includes('sitemap({'), 'config should register sitemap');
  });
  it('sitemap-index.xml exists in dist after build', () => {
    if (!fs.existsSync(DIST)) { console.log('  SKIP: dist/ not found'); return; }
    assert.ok(fs.existsSync(path.join(DIST, 'sitemap-index.xml')) || fs.existsSync(path.join(DIST, 'sitemap.xml')), 'sitemap should exist in dist/');
  });
});

// 2. copy button
describe('code block copy button', () => {
  it('BaseLayout.astro contains copy button script', () => {
    const layout = fs.readFileSync(path.join(SRC, 'layouts', 'BaseLayout.astro'), 'utf-8');
    assert.ok(layout.includes('copy-btn') || layout.includes('Copy code'), 'BaseLayout should include copy button');
    assert.ok(layout.includes('clipboard.writeText'), 'BaseLayout should have clipboard.writeText');
  });
});

// 3. twitter card
describe('twitter card meta tag', () => {
  it('BaseLayout.astro uses summary_large_image', () => {
    const layout = fs.readFileSync(path.join(SRC, 'layouts', 'BaseLayout.astro'), 'utf-8');
    assert.ok(layout.includes('summary_large_image'), 'twitter:card should be summary_large_image');
    assert.ok(!layout.includes('"summary"'), 'twitter:card should NOT be plain summary');
  });
});

// 4. edit this page
describe('"Edit this page" link', () => {
  it('DocsLayout.astro contains edit-this-page link', () => {
    const layout = fs.readFileSync(path.join(SRC, 'layouts', 'DocsLayout.astro'), 'utf-8');
    assert.ok(layout.includes('edit-this-page') || layout.includes('Edit this page'), 'DocsLayout should include Edit this page link');
    assert.ok(layout.includes('github.com/bradygaster/squad/edit'), 'Edit link should point to GitHub edit URL');
  });
});

// 5. robots.txt
describe('robots.txt', () => {
  it('public/robots.txt exists', () => {
    assert.ok(fs.existsSync(path.join(DOCS_ROOT, 'public', 'robots.txt')), 'docs/public/robots.txt should exist');
  });
  it('robots.txt contains correct directives', () => {
    const content = fs.readFileSync(path.join(DOCS_ROOT, 'public', 'robots.txt'), 'utf-8');
    assert.ok(content.includes('User-agent: *'), 'robots.txt should have User-agent: *');
    assert.ok(content.includes('Allow: /'), 'robots.txt should have Allow: /');
    assert.ok(content.includes('Sitemap:'), 'robots.txt should reference Sitemap');
  });
});

// 6. table of contents
describe('Table of Contents', () => {
  it('TableOfContents.astro component file exists', () => {
    assert.ok(fs.existsSync(path.join(SRC, 'components', 'TableOfContents.astro')), 'src/components/TableOfContents.astro should exist');
  });
  it('TableOfContents component is imported in DocsLayout', () => {
    const layout = fs.readFileSync(path.join(SRC, 'layouts', 'DocsLayout.astro'), 'utf-8');
    assert.ok(layout.includes('TableOfContents'), 'DocsLayout should import and use TableOfContents');
  });
});

// 7. RSS
describe('RSS feed', () => {
  it('package.json includes @astrojs/rss dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DOCS_ROOT, 'package.json'), 'utf-8'));
    assert.ok(pkg.dependencies?.['@astrojs/rss'] || pkg.devDependencies?.['@astrojs/rss'], '@astrojs/rss should be in package.json');
  });
  it('rss.xml.js endpoint file exists', () => {
    assert.ok(fs.existsSync(path.join(SRC, 'pages', 'rss.xml.js')), 'src/pages/rss.xml.js should exist');
  });
  it('rss.xml.js uses @astrojs/rss and pulls from blog collection', () => {
    const rssFile = fs.readFileSync(path.join(SRC, 'pages', 'rss.xml.js'), 'utf-8');
    assert.ok(rssFile.includes('@astrojs/rss'), 'rss.xml.js should import from @astrojs/rss');
    assert.ok(rssFile.includes('blog'), 'rss.xml.js should reference the blog collection');
  });
});

// 8. next/prev
describe('Next/Prev page navigation', () => {
  it('docs catch-all route computes prevPage and nextPage', () => {
    const slug = fs.readFileSync(path.join(SRC, 'pages', 'docs', '[...slug].astro'), 'utf-8');
    assert.ok(slug.includes('prevPage'), 'catch-all route should compute prevPage');
    assert.ok(slug.includes('nextPage'), 'catch-all route should compute nextPage');
    assert.ok(slug.includes('NAV_SECTIONS'), 'catch-all route should use NAV_SECTIONS');
  });
  it('DocsLayout renders prev/next navigation links', () => {
    const layout = fs.readFileSync(path.join(SRC, 'layouts', 'DocsLayout.astro'), 'utf-8');
    assert.ok(layout.includes('prevPage'), 'DocsLayout should render prevPage link');
    assert.ok(layout.includes('nextPage'), 'DocsLayout should render nextPage link');
  });
});

// 9. richer frontmatter
describe('Richer frontmatter schema', () => {
  it('config.ts adds optional tags, author, updatedAt, status fields', () => {
    const config = fs.readFileSync(path.join(SRC, 'content', 'config.ts'), 'utf-8');
    assert.ok(config.includes('tags'), 'docs schema should include tags');
    assert.ok(config.includes('author'), 'docs schema should include author');
    assert.ok(config.includes('updatedAt'), 'docs schema should include updatedAt');
    assert.ok(config.includes('status'), 'docs schema should include status');
  });
  it('DocsLayout displays updatedAt when present', () => {
    const layout = fs.readFileSync(path.join(SRC, 'layouts', 'DocsLayout.astro'), 'utf-8');
    assert.ok(layout.includes('updatedAt'), 'DocsLayout should display updatedAt');
  });
});

// 10. view transitions
describe('View Transitions', () => {
  it('BaseLayout.astro imports ViewTransitions from astro:transitions', () => {
    const layout = fs.readFileSync(path.join(SRC, 'layouts', 'BaseLayout.astro'), 'utf-8');
    assert.ok(layout.includes('ViewTransitions') && layout.includes('astro:transitions'), 'BaseLayout should import ViewTransitions from astro:transitions');
  });
  it('BaseLayout.astro renders <ViewTransitions /> in the <head>', () => {
    const layout = fs.readFileSync(path.join(SRC, 'layouts', 'BaseLayout.astro'), 'utf-8');
    assert.ok(layout.includes('<ViewTransitions />') || layout.includes('<ViewTransitions/>'), 'BaseLayout should render <ViewTransitions />');
  });
});
