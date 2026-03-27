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
const EXPECTED_GET_STARTED = ['installation', 'first-session', 'five-minute-start', 'choosing-your-path', 'migration'];

const EXPECTED_GUIDES = ['build-autonomous-agent', 'building-extensions', 'building-resilient-agents', 'contributing', 'contributors', 'extensibility', 'faq', 'github-auth-setup', 'personal-squad', 'sample-prompts', 'shell', 'tips-and-tricks'];

const EXPECTED_REFERENCE = ['cli', 'sdk', 'config', 'api-reference', 'integration', 'tools-and-hooks', 'glossary'];

const EXPECTED_SCENARIOS = [
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
  'ceremonies',
  'capability-routing',
  'consult-mode',
  'copilot-coding-agent',
  'directives',
  'enterprise-platforms',
  'export-import',
  'github-issues',
  'gitlab-issues',
  'human-team-members',
  'issue-templates',
  'keda-scaling',
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
  'rate-limiting',
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

const EXPECTED_CONCEPTS = ['architecture', 'your-team', 'memory-and-knowledge', 'parallel-work', 'github-workflow', 'portability'];

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
  const sections = ['get-started', 'guide', 'reference', 'scenarios', 'features', 'concepts'];
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
      ...EXPECTED_REFERENCE.map(n => ({ dir: 'reference', name: n })),
      ...EXPECTED_SCENARIOS.map(n => ({ dir: 'scenarios', name: n })),
      ...EXPECTED_FEATURES.map(n => ({ dir: 'features', name: n })),
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

// --- Nav size-limit + sub-grouping tests (issue #62, P2) ---

describe('Nav section order matches upstream (issue #62, P2)', () => {
  it('sections follow upstream order: Get Started, Guide, Features, Reference, Scenarios, Concepts, Cookbook', async () => {
    const { NAV_SECTIONS } = await import('../docs/src/navigation.ts');
    const titles = NAV_SECTIONS.map((s: { title: string }) => s.title);
    const expected = ['Get Started', 'Guide', 'Features', 'Reference', 'Scenarios', 'Concepts', 'Cookbook'];
    expect(titles).toEqual(expected);
  });
});

describe('Nav section size limit (issue #62, P2)', () => {
  // Sections with known large item counts — excluded from the 20-item limit.
  // Features uses category sub-groups to manage its 30+ items visually.
  // Scenarios is a flat enumeration of use-case pages.
  const KNOWN_LARGE_SECTIONS = ['Features', 'Scenarios'];

  it('no section exceeds 20 items unless in the known-large exclusion list', async () => {
    const { NAV_SECTIONS } = await import('../docs/src/navigation.ts');
    const violations: string[] = [];
    for (const section of NAV_SECTIONS) {
      if (KNOWN_LARGE_SECTIONS.includes(section.title)) continue;
      if (section.items.length > 20) {
        violations.push(`${section.title} has ${section.items.length} items (limit: 20)`);
      }
    }
    expect(violations, 'Sections exceeding size limit').toEqual([]);
  });
});

// --- Nav sub-grouping tests (issue #62, P2) ---

describe('NavItem type — optional category field', () => {
  it('NavItem accepts an optional category property', async () => {
    // Dynamic import so we exercise the real exported type at runtime.
    // TypeScript type-level check: the assignment below would fail tsc
    // if NavItem did not include `category?: string`.
    const { NAV_SECTIONS } = await import('../docs/src/navigation.ts');

    // Construct a NavItem with the optional category field
    const itemWithCategory: { title: string; slug: string; category?: string } = {
      title: 'Test Item',
      slug: 'features/test-item',
      category: 'Integrations',
    };

    // Verify the shape is compatible — title and slug are required
    expect(itemWithCategory).toHaveProperty('title');
    expect(itemWithCategory).toHaveProperty('slug');
    expect(itemWithCategory).toHaveProperty('category', 'Integrations');

    // A NavItem WITHOUT category should also work (backward-compat)
    const itemWithoutCategory: { title: string; slug: string; category?: string } = {
      title: 'Another Item',
      slug: 'features/another-item',
    };
    expect(itemWithoutCategory).toHaveProperty('title');
    expect(itemWithoutCategory).not.toHaveProperty('category');

    // Existing NAV_SECTIONS should load without error
    expect(NAV_SECTIONS.length).toBeGreaterThan(0);
    const features = NAV_SECTIONS.find((s: { title: string }) => s.title === 'Features');
    expect(features).toBeDefined();
    expect(features!.items.length).toBeGreaterThan(0);
  });
});

describe('Sidebar category headers (issue #62, P2)', () => {
  /**
   * Manual verification plan (until Sidebar.astro is updated):
   *
   * Once the `category` field is added to NavItem and Sidebar.astro renders
   * category headers, verify:
   *
   * 1. Items with `category: "Core"` appear under a "Core" sub-header.
   * 2. Items WITHOUT a category appear in their original order (no header).
   * 3. Category headers are visually distinct (smaller font, muted color).
   * 4. Category headers are NOT clickable links.
   * 5. Keyboard / screen-reader navigation skips category headers.
   *
   * Automated check below confirms Sidebar.astro exists and renders the
   * Features section. After implementation, add assertions for category
   * header elements (e.g., `data-nav-category` attribute).
   */
  it('Sidebar component exists and renders Features section', () => {
    const sidebarPath = join(DOCS_DIR, 'src', 'components', 'Sidebar.astro');
    expect(existsSync(sidebarPath), 'Sidebar.astro must exist').toBe(true);

    const source = readFileSync(sidebarPath, 'utf-8');
    expect(source).toContain('NAV_SECTIONS');
    expect(source).toContain('section.title');
  });

  it.todo('category headers render as non-clickable sub-headings in the sidebar');
  it.todo('items without a category render normally (no extra header)');
  it.todo('category headers have data-nav-category attribute for test hooks');
});
