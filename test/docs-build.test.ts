/**
 * Tests for docs site build (Astro) and markdown validation
 * Verifies Astro build execution, output quality, and structure compliance
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename } from 'node:path';

const DOCS_DIR = join(process.cwd(), 'docs');
const CONTENT_DIR = join(DOCS_DIR, 'src', 'content');
const DOCS_CONTENT_DIR = join(CONTENT_DIR, 'docs');
const BLOG_CONTENT_DIR = join(CONTENT_DIR, 'blog');
const DIST_DIR = join(DOCS_DIR, 'dist');

// Expected content directories in src/content/docs/
const EXPECTED_GET_STARTED = ['choose-your-interface', 'first-session', 'installation', 'migration'];

const EXPECTED_GUIDES = ['build-autonomous-agent', 'tips-and-tricks', 'sample-prompts', 'personal-squad', 'contributing', 'contributors', 'shell', 'faq', 'extensibility', 'building-extensions', 'github-auth-setup'];

const EXPECTED_REFERENCE = ['cli', 'sdk', 'config', 'api-reference', 'integration', 'tools-and-hooks', 'glossary', 'vscode-troubleshooting'];

const EXPECTED_SCENARIOS= [
  'aspire-dashboard',
  'ci-cd-integration',
  'client-compatibility',
  'cross-org-auth',
  'disaster-recovery',
  'existing-repo',
  'issue-driven-dev',
  'keep-my-squad',
  'large-codebase',
  'mid-project',
  'monorepo',
  'multi-codespace',
  'multiple-squads',
  'new-project',
  'open-source',
  'private-repos',
  'release-process',
  'scaling-workstreams',
  'solo-dev',
  'switching-models',
  'team-of-humans',
  'team-portability',
  'team-state-storage',
  'troubleshooting',
  'upgrading',
];

const EXPECTED_FEATURES = [
  'built-in-roles',
  'ceremonies',
  'consult-mode',
  'context-hygiene',
  'copilot-coding-agent',
  'cost-tracking',
  'directives',
  'distributed-mesh',
  'enterprise-platforms',
  'export-import',
  'github-issues',
  'gitlab-issues',
  'human-team-members',
  'issue-templates',
  'labels',
  'marketplace',
  'mcp',
  'memory',
  'model-selection',
  'notifications',
  'parallel-execution',
  'plugins',
  'prd-mode',
  'project-boards',
  'ralph',
  'remote-control',
  'response-modes',
  'reviewer-protocol',
  'routing',
  'skills',
  'squad-rc',
  'streams',
  'team-setup',
  'upstream-inheritance',
  'vscode',
  'worktrees',
];

const EXPECTED_CONCEPTS = ['architecture', 'github-workflow', 'memory-and-knowledge', 'parallel-work', 'portability', 'your-team'];

// Standalone pages at docs root that are intentionally not in any section subdirectory.
// Add new root-level pages here to acknowledge them as intentional.
const STANDALONE_PAGES = [
  'whatsnew',
  'insider-program',
  'community',
  'sdk-first-mode',
  'tour-gitlab-issues',
];

// Blog posts are discovered dynamically to avoid breaking tests when posts change
const EXPECTED_BLOG = existsSync(BLOG_CONTENT_DIR)
  ? readdirSync(BLOG_CONTENT_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse()
  : [];

function getMarkdownFiles(section: string): string[] {
  const dir = join(DOCS_CONTENT_DIR, section);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => join(dir, f));
}

function getAllMarkdownFiles(): string[] {
  const sections = ['get-started', 'guide', 'features', 'reference', 'scenarios', 'concepts'];
  const allFiles: string[] = [];
  for (const section of sections) {
    allFiles.push(...getMarkdownFiles(section));
  }
  // Include blog files
  if (existsSync(BLOG_CONTENT_DIR)) {
    allFiles.push(
      ...readdirSync(BLOG_CONTENT_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => join(BLOG_CONTENT_DIR, f))
    );
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
      const guideDir = join(DOCS_CONTENT_DIR, 'guide');
      expect(existsSync(guideDir)).toBe(true);
      const files = readdirSync(guideDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
      for (const guide of EXPECTED_GUIDES) {
        expect(files).toContain(guide);
      }
      expect(files.length).toBe(EXPECTED_GUIDES.length);
    });

    it('features directory contains all expected markdown files', () => {
      const featuresDir = join(DOCS_CONTENT_DIR, 'features');
      expect(existsSync(featuresDir)).toBe(true);
      const files = readdirSync(featuresDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
      for (const feature of EXPECTED_FEATURES) {
        expect(files).toContain(feature);
      }
      expect(files.length).toBe(EXPECTED_FEATURES.length);
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

// --- Astro Build Tests ---

describe('Docs Build Script (Astro)', () => {
  beforeAll(() => {
    if (!existsSync(join(DOCS_DIR, 'package.json'))) return;
    if (existsSync(DIST_DIR)) {
      rmSync(DIST_DIR, { recursive: true, force: true });
    }
    execSync('npm run build', { cwd: DOCS_DIR, timeout: 120_000 });
  }, 120_000);

  afterAll(() => {
    if (existsSync(DIST_DIR)) {
      try { rmSync(DIST_DIR, { recursive: true, force: true }); } catch { /* Windows ENOTEMPTY race */ }
    }
  });

  function requireBuild() {
    return existsSync(DIST_DIR);
  }

  // Astro generates /docs/{section}/{name}/index.html
  function readDocHtml(name: string, section: string): string {
    return readFile(join(DIST_DIR, 'docs', section, name, 'index.html'));
  }

  // --- 1. Build execution ---

  it('Astro config exists', () => {
    expect(existsSync(join(DOCS_DIR, 'astro.config.mjs'))).toBe(true);
  });

  it('build runs without errors (exit code 0)', () => {
    if (!existsSync(join(DOCS_DIR, 'package.json'))) return;
    expect(() => {
      execSync('npm run build', { cwd: DOCS_DIR, timeout: 120_000 });
    }).not.toThrow();
  }, 120_000);

  // --- 2. All section files produce HTML output ---

  it('all expected doc pages produce HTML in dist/', () => {
    if (!requireBuild()) return;
    const allExpected = [
      ...EXPECTED_GET_STARTED.map(n => ({ dir: 'get-started', name: n })),
      ...EXPECTED_GUIDES.map(n => ({ dir: 'guide', name: n })),
      ...EXPECTED_FEATURES.map(n => ({ dir: 'features', name: n })),
      ...EXPECTED_REFERENCE.map(n => ({ dir: 'reference', name: n })),
      ...EXPECTED_SCENARIOS.map(n => ({ dir: 'scenarios', name: n })),
      ...EXPECTED_CONCEPTS.map(n => ({ dir: 'concepts', name: n })),
    ];
    for (const { dir, name } of allExpected) {
      const htmlPath = join(DIST_DIR, 'docs', dir, name, 'index.html');
      expect(existsSync(htmlPath), `Missing: docs/${dir}/${name}/index.html`).toBe(true);
    }
  });

  it('blog posts produce HTML in dist/blog/', () => {
    if (!requireBuild()) return;
    for (const name of EXPECTED_BLOG) {
      const htmlPath = join(DIST_DIR, 'blog', name, 'index.html');
      expect(existsSync(htmlPath), `Missing: blog/${name}/index.html`).toBe(true);
    }
  });

  // --- 3. HTML output quality ---

  describe('Astro output: code blocks with syntax highlighting', () => {
    it('fenced code blocks are rendered with Shiki highlighting', () => {
      if (!requireBuild()) return;
      const html = readDocHtml('config', 'reference');
      // Shiki uses <pre class="astro-code ..."> and <code> elements
      expect(html).toMatch(/<pre[^>]*class="[^"]*astro-code/);
    });
  });

  describe('Astro output: table markup', () => {
    it('tables render as proper <table> HTML', () => {
      if (!requireBuild()) return;
      const html = readDocHtml('cli', 'reference');
      expect(html).toMatch(/<table>/);
      expect(html).toMatch(/<thead>/);
      expect(html).toMatch(/<th>/);
      expect(html).toMatch(/<td>/);
    });
  });

  describe('Astro output: inline formatting', () => {
    it('bold text renders as <strong>', () => {
      if (!requireBuild()) return;
      const html = readDocHtml('tips-and-tricks', 'guide');
      expect(html).toMatch(/<strong>/);
    });

    it('inline code renders as <code>', () => {
      if (!requireBuild()) return;
      const html = readDocHtml('config', 'reference');
      expect(html).toMatch(/<code>[^<]+<\/code>/);
    });

    it('links render as <a> with href', () => {
      if (!requireBuild()) return;
      const html = readDocHtml('tips-and-tricks', 'guide');
      expect(html).toMatch(/<a\s+href="/);
    });
  });

  // --- 4. Landing page ---

  it('index.html is generated as landing page', () => {
    if (!requireBuild()) return;
    const indexPath = join(DIST_DIR, 'index.html');
    expect(existsSync(indexPath)).toBe(true);
    const html = readFile(indexPath);
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('Development Team');
  });

  // --- 5. Blog index ---

  it('blog index page is generated', () => {
    if (!requireBuild()) return;
    const blogIndex = join(DIST_DIR, 'blog', 'index.html');
    expect(existsSync(blogIndex)).toBe(true);
    const html = readFile(blogIndex);
    expect(html).toContain('Blog');
  });

  // --- 6. Navigation structure ---

  it('doc pages contain sidebar navigation', () => {
    if (!requireBuild()) return;
    const html = readDocHtml('tips-and-tricks', 'guide');
    expect(html).toMatch(/sidebar/i);
    expect(html).toContain('Get Started');
    expect(html).toContain('Features');
    expect(html).toContain('Reference');
  });

  // --- 7. HTML structure validation ---

  it('all HTML files have proper DOCTYPE and closing tags', () => {
    if (!requireBuild()) return;
    const samples = [
      { dir: 'guide', name: 'tips-and-tricks' },
      { dir: 'reference', name: 'cli' },
      { dir: 'get-started', name: 'installation' },
    ];
    for (const { dir, name } of samples) {
      const html = readDocHtml(name, dir);
      expect(html).toMatch(/<!doctype html>/i);
      expect(html).toMatch(/<\/html>/i);
      expect(html).toMatch(/<\/body>/i);
    }
  });

  it('doc pages contain <article> content area', () => {
    if (!requireBuild()) return;
    const html = readDocHtml('tips-and-tricks', 'guide');
    expect(html).toMatch(/<article[\s>]/);
  });

  // --- 8. Search (Pagefind) ---

  it('pagefind index is generated in dist/', () => {
    if (!requireBuild()) return;
    const pagefindDir = join(DIST_DIR, 'pagefind');
    expect(existsSync(pagefindDir), 'pagefind/ directory missing').toBe(true);
    expect(existsSync(join(pagefindDir, 'pagefind.js')), 'pagefind.js missing').toBe(true);
    expect(existsSync(join(pagefindDir, 'pagefind-entry.json')), 'pagefind-entry.json missing').toBe(true);
  });

  it('doc pages include search UI in header', () => {
    if (!requireBuild()) return;
    const html = readDocHtml('tips-and-tricks', 'guide');
    expect(html).toContain('id="search-btn"');
    expect(html).toContain('id="search-modal"');
  });
});

// --- Docs Hygiene Guards (source validation — no build required) ---

describe('Docs Hygiene Guards', () => {
  const ALL_SECTION_DIRS = ['get-started', 'guide', 'features', 'reference', 'scenarios', 'concepts', 'cookbook'];
  const NAVIGATION_TS = join(DOCS_DIR, 'src', 'navigation.ts');

  /** Extract every slug value from navigation.ts by reading it as text. */
  function getNavSlugs(): string[] {
    const content = readFile(NAVIGATION_TS);
    const matches = content.match(/slug:\s*['"]([^'"]+)['"]/g) || [];
    const slugs = matches.map(m => m.replace(/slug:\s*['"]/, '').replace(/['"]$/, ''));
    if (slugs.length === 0) {
      throw new Error(
        'getNavSlugs() returned 0 slugs — navigation.ts may have changed format. ' +
        `Check ${NAVIGATION_TS} and update the slug extraction regex if needed.`
      );
    }
    return slugs;
  }

  /** All .md files in section subdirectories (excludes root-level files and blog). */
  function getSectionFiles(): Array<{ slug: string; filepath: string }> {
    const results: Array<{ slug: string; filepath: string }> = [];
    for (const section of ALL_SECTION_DIRS) {
      const dir = join(DOCS_CONTENT_DIR, section);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
        results.push({ slug: `${section}/${f.replace('.md', '')}`, filepath: join(dir, f) });
      }
    }
    return results;
  }

  /** Root-level .md files directly under docs/src/content/docs/. */
  function getRootLevelFiles(): string[] {
    return readdirSync(DOCS_CONTENT_DIR).filter(f => f.endsWith('.md'));
  }

  /** Every .md file across all docs sections, root level, and blog — for content scanning. */
  function getAllDocsFilesForScanning(): string[] {
    const files = getSectionFiles().map(f => f.filepath);
    for (const f of getRootLevelFiles()) {
      files.push(join(DOCS_CONTENT_DIR, f));
    }
    if (existsSync(BLOG_CONTENT_DIR)) {
      for (const f of readdirSync(BLOG_CONTENT_DIR).filter(f => f.endsWith('.md'))) {
        files.push(join(BLOG_CONTENT_DIR, f));
      }
    }
    return files;
  }

  it('no orphaned pages — every content file appears in navigation.ts or STANDALONE_PAGES', () => {
    const navSlugs = getNavSlugs();
    const errors: string[] = [];

    for (const { slug } of getSectionFiles()) {
      if (!navSlugs.includes(slug)) {
        errors.push(
          `"${slug}" is not in navigation.ts or the standalone allowlist. Add it to the nav or to STANDALONE_PAGES if it's intentionally standalone.`
        );
      }
    }

    for (const f of getRootLevelFiles()) {
      const slug = f.replace('.md', '');
      if (!navSlugs.includes(slug) && !STANDALONE_PAGES.includes(slug)) {
        errors.push(
          `"${f}" is not in navigation.ts or the standalone allowlist. Add it to the nav or to STANDALONE_PAGES if it's intentionally standalone.`
        );
      }
    }

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  it('no dead nav links — every navigation.ts slug has a matching .md file on disk', () => {
    const navSlugs = getNavSlugs();
    const errors: string[] = [];

    for (const slug of navSlugs) {
      const filepath = join(DOCS_CONTENT_DIR, `${slug}.md`);
      if (!existsSync(filepath)) {
        errors.push(
          `Nav entry "${slug}" has no matching content file. Remove it from navigation.ts or create the page.`
        );
      }
    }

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  it('no stale root-level legacy files — root .md files must be in STANDALONE_PAGES allowlist', () => {
    const rootFiles = getRootLevelFiles();
    const errors: string[] = [];

    for (const f of rootFiles) {
      const slug = f.replace('.md', '');
      if (!STANDALONE_PAGES.includes(slug)) {
        errors.push(
          `"${f}" is a root-level .md file not in STANDALONE_PAGES. Move it to a section directory or delete it.`
        );
      }
    }

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  // Files that may reference the deprecated install command as historical "before"
  // examples — migration guides and upgrade docs intentionally show old vs. new.
  // Blog posts are historical content and are never rewritten.
  const LEGACY_INSTALL_ALLOWLIST: string[] = [
    join(DOCS_CONTENT_DIR, 'get-started', 'migration.md'),
    join(DOCS_CONTENT_DIR, 'scenarios', 'upgrading.md'),
  ];

  // Files that may reference the legacy .ai-team/ directory name because they
  // explain the migration from the old format or document the migration tooling.
  // Blog posts are historical content and are never rewritten.
  const LEGACY_DIR_ALLOWLIST: string[] = [
    join(DOCS_CONTENT_DIR, 'get-started', 'migration.md'),
    join(DOCS_CONTENT_DIR, 'scenarios', 'upgrading.md'),
    join(DOCS_CONTENT_DIR, 'scenarios', 'team-portability.md'),
    join(DOCS_CONTENT_DIR, 'scenarios', 'switching-models.md'),
    join(DOCS_CONTENT_DIR, 'scenarios', 'team-state-storage.md'),
    join(DOCS_CONTENT_DIR, 'sdk-first-mode.md'),
    join(DOCS_CONTENT_DIR, 'reference', 'cli.md'),
  ];

  it('allowlists contain only files that exist on disk', () => {
    const allAllowlistFiles = [...new Set([...LEGACY_INSTALL_ALLOWLIST, ...LEGACY_DIR_ALLOWLIST])];
    const stale = allAllowlistFiles.filter(f => !existsSync(f));
    expect(
      stale,
      `Allowlist entries no longer exist on disk — remove them:\n${stale.join('\n')}`
    ).toHaveLength(0);
  });

  it('no deprecated install commands — "npx github:bradygaster/squad" must not appear in any .md file', () => {
    const errors: string[] = [];

    for (const filepath of getAllDocsFilesForScanning()) {
      if (LEGACY_INSTALL_ALLOWLIST.includes(filepath)) continue;
      if (filepath.startsWith(BLOG_CONTENT_DIR)) continue;
      if (readFile(filepath).includes('npx github:bradygaster/squad')) {
        errors.push(
          `"${filepath}" contains deprecated install command "npx github:bradygaster/squad". Use "npm install -g @bradygaster/squad-cli" instead.`
        );
      }
    }

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  it('no deprecated .ai-team/ directory references in any .md file', () => {
    const errors: string[] = [];

    for (const filepath of getAllDocsFilesForScanning()) {
      if (LEGACY_DIR_ALLOWLIST.includes(filepath)) continue;
      if (filepath.startsWith(BLOG_CONTENT_DIR)) continue;
      if (readFile(filepath).includes('.ai-team/')) {
        errors.push(
          `"${filepath}" references deprecated ".ai-team/" directory. Use ".squad/" instead.`
        );
      }
    }

    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});
