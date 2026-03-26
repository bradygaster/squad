/**
 * Tests for internal link and anchor validation
 * Verifies all relative markdown links resolve and anchors exist
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const DOCS_DIR = join(process.cwd(), 'docs');
const CONTENT_DIR = join(DOCS_DIR, 'src', 'content');
const ROOT_README = join(process.cwd(), 'README.md');

// Known broken links to skip (pre-existing issues to be fixed separately)
const KNOWN_ISSUES = [
  'README.md:40', // Migration guide link needs updating
  'README.md:248', // SDK-first mode link needs updating
  'docs\\src\\content\\docs\\scenarios\\client-compatibility.md:270', // Troubleshooting anchor
  'docs\\src\\content\\docs\\tour-first-session.md:263', // Pre-existing on dev — tour-github-issues.md doesn't exist (bradygaster/squad#610)
];

function isKnownIssue(sourceFile: string, lineNumber: number): boolean {
  const key = `${sourceFile}:${lineNumber}`;
  return KNOWN_ISSUES.some(issue => key.includes(issue) || issue.includes(key));
}

interface LinkInfo {
  sourceFile: string;
  lineNumber: number;
  linkText: string;
  targetPath: string;
  anchor?: string;
}

// GitHub-slugger compatible heading → anchor conversion
function headingToAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

// Extract all headings from a markdown file
function extractHeadings(content: string): string[] {
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const heading = match[1]
      // Remove inline code backticks
      .replace(/`([^`]+)`/g, '$1')
      // Remove bold/italic markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    headings.push(headingToAnchor(heading));
  }
  return headings;
}

// Find all markdown files in docs
function getAllMarkdownFiles(): string[] {
  const files: string[] = [];
  
  function traverse(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(CONTENT_DIR);
  if (existsSync(ROOT_README)) {
    files.push(ROOT_README);
  }
  return files;
}

// Extract all relative markdown links from a file
function extractLinks(filePath: string): LinkInfo[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const links: LinkInfo[] = [];
  
  // Match markdown links: [text](url) or [text](url#anchor)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  
  lines.forEach((line, index) => {
    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const linkText = match[1];
      const url = match[2];
      
      // Skip external links, mailto, and pure anchors
      if (url.startsWith('http://') || url.startsWith('https://') || 
          url.startsWith('mailto:') || url.startsWith('#')) {
        continue;
      }
      
      // Only process relative markdown links
      if (url.includes('.md')) {
        const [targetPath, anchor] = url.split('#');
        links.push({
          sourceFile: relative(process.cwd(), filePath),
          lineNumber: index + 1,
          linkText,
          targetPath,
          anchor,
        });
      }
    }
  });
  
  return links;
}

// Resolve a relative link to an absolute path
// Handle Astro content structure: blog links to docs need special handling
function resolveLink(sourceFile: string, targetPath: string): string {
  const sourceDir = dirname(sourceFile);
  let resolved = resolve(sourceDir, targetPath);
  
  // If source is in blog/ and link starts with ../, check if target is in docs/
  if (sourceFile.includes(join('content', 'blog')) && targetPath.startsWith('../')) {
    // Try resolving as if it's in docs/ subdirectory
    const contentDir = dirname(dirname(sourceFile)); // Go up to content/
    const docsPath = resolve(contentDir, 'docs', targetPath.substring(3)); // Remove ../ and resolve from docs/
    if (existsSync(docsPath)) {
      return docsPath;
    }
  }
  
  return resolved;
}

describe('Docs Link Validation', () => {
  const allFiles = getAllMarkdownFiles();
  const allLinks: LinkInfo[] = [];
  
  // Collect all links
  for (const file of allFiles) {
    allLinks.push(...extractLinks(file));
  }
  
  it('should find markdown files to validate', () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });
  
  describe('Internal Links Resolve', () => {
    it('all relative markdown links point to existing files', () => {
      const brokenLinks: LinkInfo[] = [];
      
      for (const link of allLinks) {
        // Skip known issues
        if (isKnownIssue(link.sourceFile, link.lineNumber)) continue;
        
        const sourceFilePath = join(process.cwd(), link.sourceFile);
        const resolvedPath = resolveLink(sourceFilePath, link.targetPath);
        
        if (!existsSync(resolvedPath)) {
          brokenLinks.push(link);
        }
      }
      
      if (brokenLinks.length > 0) {
        const report = brokenLinks.map(link => 
          `${link.sourceFile}:${link.lineNumber} - Link to "${link.targetPath}" does not exist (text: "${link.linkText}")`
        ).join('\n');
        throw new Error(`Found ${brokenLinks.length} broken link(s):\n${report}`);
      }
      
      expect(brokenLinks.length).toBe(0);
    });
  });
  
  describe('Anchor Targets Exist', () => {
    it('all anchor fragments point to existing headings', () => {
      const brokenAnchors: LinkInfo[] = [];
      
      for (const link of allLinks) {
        if (!link.anchor) continue; // Skip links without anchors
        
        // Skip known issues
        if (isKnownIssue(link.sourceFile, link.lineNumber)) continue;
        
        const sourceFilePath = join(process.cwd(), link.sourceFile);
        const resolvedPath = resolveLink(sourceFilePath, link.targetPath);
        
        // Skip if file doesn't exist (caught by previous test)
        if (!existsSync(resolvedPath)) continue;
        
        const targetContent = readFileSync(resolvedPath, 'utf-8');
        const headings = extractHeadings(targetContent);
        
        if (!headings.includes(link.anchor)) {
          brokenAnchors.push(link);
        }
      }
      
      if (brokenAnchors.length > 0) {
        const report = brokenAnchors.map(link => {
          const sourceFilePath = join(process.cwd(), link.sourceFile);
          const resolvedPath = resolveLink(sourceFilePath, link.targetPath);
          const targetContent = readFileSync(resolvedPath, 'utf-8');
          const availableHeadings = extractHeadings(targetContent);
          return `${link.sourceFile}:${link.lineNumber} - Anchor "#${link.anchor}" not found in "${link.targetPath}"\n  Available anchors: ${availableHeadings.slice(0, 5).join(', ')}${availableHeadings.length > 5 ? '...' : ''}`;
        }).join('\n\n');
        throw new Error(`Found ${brokenAnchors.length} broken anchor(s):\n\n${report}`);
      }
      
      expect(brokenAnchors.length).toBe(0);
    });
  });
});
