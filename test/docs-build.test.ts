/**
 * Tests for docs site build (markdown-it upgrade) and markdown validation
 * Verifies docs/build.js execution, markdown-it output quality, and structure compliance
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename } from 'node:path';

const DOCS_DIR = join(process.cwd(), 'docs');
const GUIDE_DIR = join(DOCS_DIR, 'guide');
const DIST_DIR = join(DOCS_DIR, 'dist');
const BUILD_SCRIPT = join(DOCS_DIR, 'build.js');
const TEMPLATE_PATH = join(DOCS_DIR, 'template.html');

// All sections in the simplified docs structure (5 sections + blog)
const EXPECTED_GET_STARTED = ['installation', 'first-session'];

const EXPECTED_GUIDES = ['tips-and-tricks', 'sample-prompts', 'personal-squad', 'contributing', 'contributors'];

const EXPECTED_REFERENCE = ['cli', 'sdk', 'config'];

const EXPECTED_SCENARIOS = [
  'issue-driven-dev', 'existing-repo', 'ci-cd-integration', 'solo-dev', 'monorepo', 'team-of-humans',
];

// Blog posts are discovered dynamically from docs/blog/ to avoid breaking
// tests when posts are added, removed, or renumbered (see issue #282).
const BLOG_DIR = join(DOCS_DIR, 'blog');
const EXPECTED_BLOG = existsSync(BLOG_DIR)
  ? readdirSync(BLOG_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse() // newest first (matches numbering convention)
  : [];

// All sections for build output validation
const ALL_EXPECTED: Array<{ dir: string; name: string }> = [
  ...EXPECTED_GET_STARTED.map(n => ({ dir: 'get-started', name: n })),
  ...EXPECTED_GUIDES.map(n => ({ dir: 'guide', name: n })),
  ...EXPECTED_REFERENCE.map(n => ({ dir: 'reference', name: n })),
  ...EXPECTED_SCENARIOS.map(n => ({ dir: 'scenarios', name: n })),
  ...EXPECTED_BLOG.map(n => ({ dir: 'blog', name: n })),
];

function getMarkdownFiles(dirName: string = 'guide'): string[] {
  const dir = join(DOCS_DIR, dirName);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => join(dir, f));
}

function getAllMarkdownFiles(): string[] {
  const sections = ['get-started', 'guide', 'reference', 'scenarios', 'blog'];
  const allFiles: string[] = [];
  for (const section of sections) {
    allFiles.push(...getMarkdownFiles(section));
  }
  return allFiles;
}

function readFile(filepath: string): string {
  return readFileSync(filepath, 'utf-8');
}

// --- Source Markdown Validation (always runs) ---

describe('Docs Structure Validation', () => {
  describe('Markdown Files', () => {
    it('guide directory contains all expected markdown files', () => {
      expect(existsSync(GUIDE_DIR)).toBe(true);
      const files = readdirSync(GUIDE_DIR).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
      for (const guide of EXPECTED_GUIDES) {
        expect(files).toContain(guide);
      }
      expect(files.length).toBe(EXPECTED_GUIDES.length);
    });

    it('all markdown files have proper headings', () => {
      for (const file of getAllMarkdownFiles()) {
        const content = readFile(file);
        expect(/^#+\s+.+/m.test(content), `${basename(file)} missing heading`).toBe(true);
      }
    });

    it('all code blocks are properly fenced (even count of ```)', () => {
      for (const file of getAllMarkdownFiles()) {
        const content = readFile(file);
        const fenceCount = (content.match(/```/g) || []).length;
        expect(fenceCount % 2, `${basename(file)} has mismatched fences`).toBe(0);
      }
    });

    it('no empty markdown files', () => {
      for (const file of getAllMarkdownFiles()) {
        expect(readFile(file).length, `${basename(file)} is empty`).toBeGreaterThan(10);
      }
    });
  });

  describe('Code Example Validation', () => {
    it('code blocks contain language specification or valid content', () => {
      for (const file of getAllMarkdownFiles()) {
        const codeBlocks = readFile(file).match(/```[\s\S]*?```/g) || [];
        for (const block of codeBlocks) {
          expect(block.split('\n').length).toBeGreaterThan(1);
        }
      }
    });

    it('bash examples have non-empty content', () => {
      for (const file of getAllMarkdownFiles()) {
        const bashBlocks = readFile(file).match(/```(?:bash|sh|shell)[\s\S]*?```/g) || [];
        for (const block of bashBlocks) {
          const lines = block.split('\n').filter(l => l.trim() && !l.startsWith('```'));
          expect(lines.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

// --- Build Script Tests (markdown-it upgrade contract) ---

describe('Docs Build Script (markdown-it)', () => {
  // Run build once before all tests in this suite, clean up after
  beforeAll(() => {
    if (!existsSync(BUILD_SCRIPT)) return;
    if (existsSync(DIST_DIR)) {
      rmSync(DIST_DIR, { recursive: true, force: true });
    }
    execSync(`node "${BUILD_SCRIPT}"`, { cwd: DOCS_DIR, timeout: 60_000 });
  }, 60_000);

  afterAll(() => {
    if (existsSync(DIST_DIR)) {
      try { rmSync(DIST_DIR, { recursive: true, force: true }); } catch { /* Windows ENOTEMPTY race */ }
    }
  });

  // Helper: skip entire suite gracefully if build.js isn't upgraded yet
  function requireBuild() {
    if (!existsSync(BUILD_SCRIPT)) {
      return false;
    }
    return existsSync(DIST_DIR);
  }

  function readHtml(name: string, dir: string): string {
    return readFile(join(DIST_DIR, dir, `${name}.html`));
  }

  function readRootHtml(name: string): string {
    return readFile(join(DIST_DIR, `${name}.html`));
  }

  // --- 1. Build execution ---

  it('docs/build.js exists', () => {
    expect(existsSync(BUILD_SCRIPT)).toBe(true);
  });

  it('build.js runs without errors (exit code 0)', () => {
    if (!existsSync(BUILD_SCRIPT)) return;
    expect(() => {
      execSync(`node "${BUILD_SCRIPT}"`, { cwd: DOCS_DIR, timeout: 60_000 });
    }).not.toThrow();
  }, 60_000);

  // --- 2. All section files produce HTML output ---

  it('all expected files produce HTML in docs/dist/', () => {
    if (!requireBuild()) return;
    for (const { dir, name } of ALL_EXPECTED) {
      const htmlPath = join(DIST_DIR, dir, `${name}.html`);
      expect(existsSync(htmlPath), `Missing: ${dir}/${name}.html`).toBe(true);
    }
  });

  // --- 3. markdown-it output quality ---

  describe('markdown-it output: code blocks with language class', () => {
    it('fenced code blocks have language class on <code> element', () => {
      if (!requireBuild()) return;
      // reference/config.md has ```typescript blocks
      const html = readHtml('config', 'reference');
      expect(html).toMatch(/<code\s+class="language-typescript"/);
    });

    it('bash code blocks get language-bash class', () => {
      if (!requireBuild()) return;
      const html = readHtml('cli', 'reference');
      expect(html).toMatch(/<code\s+class="language-bash"/);
    });
  });

  describe('markdown-it output: table markup', () => {
    it('tables render as proper <table> HTML', () => {
      if (!requireBuild()) return;
      const html = readHtml('cli', 'reference');
      expect(html).toMatch(/<table>/);
      expect(html).toMatch(/<thead>/);
      expect(html).toMatch(/<tbody>/);
      expect(html).toMatch(/<th>/);
      expect(html).toMatch(/<td>/);
    });
  });

  describe('markdown-it output: inline formatting', () => {
    it('bold text renders as <strong>', () => {
      if (!requireBuild()) return;
      const html = readHtml('tips-and-tricks', 'guide');
      expect(html).toMatch(/<strong>/);
    });

    it('inline code renders as <code> without language class', () => {
      if (!requireBuild()) return;
      const html = readHtml('config', 'reference');
      expect(html).toMatch(/<code>[^<]+<\/code>/);
    });

    it('links render as <a> with href', () => {
      if (!requireBuild()) return;
      const html = readHtml('tips-and-tricks', 'guide');
      expect(html).toMatch(/<a\s+href="/);
    });
  });

  // --- 4. Assets copied to dist/assets/ ---

  it('assets directory is copied to dist/assets/', () => {
    if (!requireBuild()) return;
    const distAssets = join(DIST_DIR, 'assets');
    expect(existsSync(distAssets), 'dist/assets/ should exist').toBe(true);
    const assetFiles = readdirSync(distAssets);
    expect(assetFiles).toContain('style.css');
    expect(assetFiles).toContain('script.js');
  });

  // --- 5. index.html as homepage ---

  it('index.html is generated from docs/index.md as homepage', () => {
    if (!requireBuild()) return;
    const indexPath = join(DIST_DIR, 'index.html');
    expect(existsSync(indexPath)).toBe(true);
    const html = readFile(indexPath);
    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toMatch(/<article[\s>]/);
    expect(html).toMatch(/<h[1-6]/);
  });

  // --- 6. Frontmatter parsing ---

  it('page title is populated in the HTML (not left as {{TITLE}})', () => {
    if (!requireBuild()) return;
    for (const { dir, name } of ALL_EXPECTED) {
      const html = readHtml(name, dir);
      expect(html).not.toContain('{{TITLE}}');
    }
  });

  // --- 7. Nav links and navigation structure ---

  it('every generated page contains a <nav> element', () => {
    if (!requireBuild()) return;
    for (const { dir, name } of ALL_EXPECTED) {
      const html = readHtml(name, dir);
      expect(html, `${dir}/${name}.html missing <nav>`).toMatch(/<nav[\s>]/);
    }
  });

  it('navigation contains links to key sections', () => {
    if (!requireBuild()) return;
    const html = readHtml('tips-and-tricks', 'guide');
    expect(html).toMatch(/guide/);
    expect(html).toMatch(/reference/);
    expect(html).toMatch(/scenarios/);
  });

  it('active page is marked in navigation', () => {
    if (!requireBuild()) return;
    const html = readHtml('config', 'reference');
    expect(html).toMatch(/class="active"/);
  });

  // --- 8. Template substitution ---

  it('{{CONTENT}} placeholder is replaced with actual content', () => {
    if (!requireBuild()) return;
    for (const { dir, name } of ALL_EXPECTED) {
      const html = readHtml(name, dir);
      expect(html).not.toContain('{{CONTENT}}');
      expect(html).toMatch(/<h[1-6]|<p>|<pre>|<ul>|<ol>/);
    }
  });

  it('{{NAV}} placeholder is replaced with navigation HTML', () => {
    if (!requireBuild()) return;
    for (const { dir, name } of ALL_EXPECTED) {
      const html = readHtml(name, dir);
      expect(html).not.toContain('{{NAV}}');
    }
  });

  it('no raw template placeholders remain in output (except SEARCH_INDEX)', () => {
    if (!requireBuild()) return;
    const templatePlaceholders = ['TITLE', 'CONTENT', 'NAV'];
    for (const { dir, name } of ALL_EXPECTED) {
      const html = readHtml(name, dir);
      for (const placeholder of templatePlaceholders) {
        expect(html, `${dir}/${name}.html has unresolved {{${placeholder}}}`).not.toContain(`{{${placeholder}}}`);
      }
    }
  });

  // --- HTML structure validation ---

  it('all HTML files have proper DOCTYPE and closing tags', () => {
    if (!requireBuild()) return;
    for (const { dir, name } of ALL_EXPECTED) {
      const html = readHtml(name, dir);
      expect(html).toMatch(/<!DOCTYPE html>/i);
      expect(html).toMatch(/<\/html>/i);
      expect(html).toMatch(/<\/body>/i);
    }
  });

  it('HTML contains <article> content area from template', () => {
    if (!requireBuild()) return;
    for (const { dir, name } of ALL_EXPECTED) {
      const html = readHtml(name, dir);
      expect(html).toMatch(/<article[\s>]/);
    }
  });
});
