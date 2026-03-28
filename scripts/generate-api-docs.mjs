/**
 * Generate API reference markdown from the Squad SDK source using TypeDoc.
 *
 * Usage:
 *   node scripts/generate-api-docs.mjs
 *
 * Outputs markdown to docs/src/content/docs/reference/api/.
 * Runs TypeDoc, then normalizes filenames for Astro compatibility and
 * replaces the generated index with a curated landing page.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, readdirSync, readFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SDK_DIR = join(ROOT, 'packages', 'squad-sdk');
const API_OUT = join(ROOT, 'docs', 'src', 'content', 'docs', 'reference', 'api');

/** Convert a TypeDoc filename to an Astro-safe slug (lowercase, dots → dashes). */
function toSafeFilename(original) {
  // Class.RuntimeEventBus.md → class-runtimeeventbus.md
  return original.toLowerCase().replace(/\./g, '-').replace(/-md$/, '.md');
}

// Ensure output directory exists (fresh clones may not have it)
mkdirSync(API_OUT, { recursive: true });

// Resolve local TypeDoc binary to avoid npx resolution overhead
const typedocBin = join(SDK_DIR, 'node_modules', '.bin', 'typedoc');

// Step 1 — Run TypeDoc
console.log('⚙️  Running TypeDoc…');
try {
  execSync(typedocBin, { cwd: SDK_DIR, stdio: 'inherit' });
} catch (err) {
  console.error(`❌ TypeDoc failed. Command: ${typedocBin} (cwd: ${SDK_DIR})`);
  console.error(err.message);
  process.exit(1);
}

// Step 2 — Rename files and build rename map
const rawFiles = readdirSync(API_OUT).filter(f => f.endsWith('.md') && f !== 'index.md');
const renameMap = new Map(); // old filename → new filename

for (const oldName of rawFiles) {
  const newName = toSafeFilename(oldName);
  renameMap.set(oldName, newName);
  if (oldName !== newName) {
    renameSync(join(API_OUT, oldName), join(API_OUT, newName));
  }
}

// Step 3 — Rewrite internal links in all generated files
const renamedFiles = readdirSync(API_OUT).filter(f => f.endsWith('.md') && f !== 'index.md');
for (const file of renamedFiles) {
  const filePath = join(API_OUT, file);
  let content = readFileSync(filePath, 'utf-8');
  let changed = false;

  for (const [oldName, newName] of renameMap) {
    if (content.includes(oldName)) {
      content = content.replaceAll(oldName, newName);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(filePath, content);
  }
}

// Step 4 — Collect files by category
const categories = {
  Classes: [],
  Interfaces: [],
  Functions: [],
  'Type aliases': [],
  Variables: [],
};

for (const file of renamedFiles) {
  const content = readFileSync(join(API_OUT, file), 'utf-8');
  const headingMatch = content.match(/^#\s+\w+:\s+(.+)$/m);
  const name = headingMatch ? headingMatch[1] : file.replace(/-/g, '.').replace(/\.md$/, '');

  if (file.startsWith('class-')) categories.Classes.push({ name, file });
  else if (file.startsWith('interface-')) categories.Interfaces.push({ name, file });
  else if (file.startsWith('function-')) categories.Functions.push({ name, file });
  else if (file.startsWith('typealias-')) categories['Type aliases'].push({ name, file });
  else if (file.startsWith('variable-')) categories.Variables.push({ name, file });
}

for (const cat of Object.values(categories)) {
  cat.sort((a, b) => a.name.localeCompare(b.name));
}

// Step 5 — Write curated landing page
const classCount = categories.Classes.length;
const ifaceCount = categories.Interfaces.length;
const fnCount = categories.Functions.length;
const typeCount = categories['Type aliases'].length;
const varCount = categories.Variables.length;
const total = classCount + ifaceCount + fnCount + typeCount + varCount;

let landing = `---
title: SDK API reference
description: Auto-generated TypeScript API reference for @bradygaster/squad-sdk.
---

# SDK API reference

> ⚠️ **Experimental** — Squad is alpha software. APIs may change between releases.

Auto-generated from the \`@bradygaster/squad-sdk\` TypeScript source using [TypeDoc](https://typedoc.org/).
This reference covers **${total}** public exports: ${classCount} classes, ${ifaceCount} interfaces, ${fnCount} functions, ${typeCount} type aliases, and ${varCount} variables.

To regenerate, run:

\`\`\`bash
npm run docs:api
\`\`\`

---

`;

for (const [title, items] of Object.entries(categories)) {
  if (items.length === 0) continue;
  landing += `## ${title}\n\n`;
  for (const { name, file } of items) {
    landing += `- [${name}](${file})\n`;
  }
  landing += '\n';
}

landing += `---

## See also

- [SDK quick reference](/squad/docs/reference/sdk) — curated examples for common SDK usage
- [Tools & hooks](/squad/docs/reference/tools-and-hooks) — custom tools and hook pipeline
- [Config reference](/squad/docs/reference/config) — configuration file options
`;

// Remove the TypeDoc-generated index.md before writing ours
try { unlinkSync(join(API_OUT, 'index.md')); } catch { /* noop */ }
writeFileSync(join(API_OUT, 'index.md'), landing);
console.log(`✅ API reference generated — ${total} exports across ${renamedFiles.length} pages`);
