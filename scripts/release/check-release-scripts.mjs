#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isScalar,
  parseDocument,
  visit,
} from 'yaml';

const releaseDir = path.resolve('scripts', 'release');

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function runScalars(text, file) {
  const document = parseDocument(text, { keepSourceTokens: true, uniqueKeys: true });
  if (document.errors.length) {
    throw new Error(`${file} is not valid YAML:\n${document.errors.map((error) => error.message).join('\n')}`);
  }
  const scalars = [];
  visit(document, {
    Pair(_key, pair) {
      if (!isScalar(pair.key) || pair.key.value !== 'run' || !isScalar(pair.value)) return;
      const offset = pair.value.range?.[0] ?? 0;
      scalars.push({
        value: String(pair.value.value ?? ''),
        source: pair.value.srcToken?.source ?? String(pair.value.value ?? ''),
        type: pair.value.type ?? 'PLAIN',
        line: lineNumberAt(text, offset),
      });
    },
  });
  return scalars;
}

function quotedArgumentSpansNewline(source, start) {
  let index = start;
  if (source[index] === '=') index += 1;
  while (source[index] === ' ' || source[index] === '\t') index += 1;
  if (source[index] === '\\' && /\r?\n/.test(source.slice(index + 1, index + 3))) return true;
  if (source[index] === '\r' || source[index] === '\n') return true;
  const quote = source[index];
  if (quote !== '"' && quote !== "'") return false;
  for (index += 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\r' || character === '\n') return true;
    if (character === quote && (quote === "'" || source[index - 1] !== '\\')) return false;
  }
  return false;
}

export function findWorkflowJavaScriptViolations(text, file = '<workflow>') {
  const violations = [];
  const evalPattern = /\bnode(?:\.exe)?(?:(?:[ \t]+|\\\r?\n[ \t]*)+--[A-Za-z0-9-]+(?:=[^ \t\r\n]+)?)*(?:[ \t]+|\\\r?\n[ \t]*)+(?:--eval|--print|-(?:pe|ep|e|p))(?=[ \t=\\\r\n"']|$)/g;
  const heredocPattern = /\bnode(?:\.exe)?\s+(?:-\s+)?<<['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/g;
  for (const scalar of runScalars(text, file)) {
    for (const match of scalar.source.matchAll(heredocPattern)) {
      const relativeLine = scalar.source.slice(0, match.index).split(/\r?\n/).length - 1;
      violations.push(`${file}:${scalar.line + relativeLine}: inline node heredoc`);
    }
    for (const match of scalar.source.matchAll(evalPattern)) {
      const relativeLine = scalar.source.slice(0, match.index).split(/\r?\n/).length - 1;
      const invocationLine = scalar.source.slice(match.index, scalar.source.indexOf('\n', match.index) < 0
        ? scalar.source.length
        : scalar.source.indexOf('\n', match.index));
      const continued = /\\\s*$/.test(invocationLine)
        || match[0].includes('\n')
        || quotedArgumentSpansNewline(scalar.source, match.index + match[0].length);
      const folded = scalar.type === 'BLOCK_FOLDED'
        && scalar.source.trim().split(/\r?\n/).length > 1;
      if (continued || folded) {
        violations.push(`${file}:${scalar.line + relativeLine}: multi-line inline Node program`);
      }
    }
  }
  return violations;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  for (const file of readdirSync(releaseDir).filter((name) => name.endsWith('.mjs')).sort()) {
    execFileSync(process.execPath, ['--check', path.join(releaseDir, file)], { stdio: 'inherit' });
  }

  const workflowDir = path.resolve('.github', 'workflows');
  const violations = [];
  for (const file of readdirSync(workflowDir).filter((name) => name.endsWith('.yml')).sort()) {
    const text = readFileSync(path.join(workflowDir, file), 'utf8');
    violations.push(...findWorkflowJavaScriptViolations(text, file));
  }
  if (violations.length) {
    throw new Error(`Workflow JavaScript must live in scripts/release/*.mjs:\n${violations.join('\n')}`);
  }
  console.log(`Checked ${readdirSync(releaseDir).filter((name) => name.endsWith('.mjs')).length} release scripts; no inline workflow JavaScript found.`);
}
