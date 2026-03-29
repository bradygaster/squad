/**
 * Email scrubbing utility — removes PII from Squad state files
 * @module cli/core/email-scrub
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const NAME_WITH_EMAIL_PATTERN = /([a-zA-Z0-9_-]+)\s*\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/g;

/**
 * Scrub email addresses from all files in a directory
 * Returns count of files scrubbed
 */
export async function scrubEmails(dir: string): Promise<number> {
  const scrubbedFiles: string[] = [];
  
  const filesToScrub = [
    'team.md',
    'decisions.md',
    'routing.md',
    'ceremonies.md'
  ];
  
  // Scrub root-level files
  for (const file of filesToScrub) {
    const filePath = path.join(dir, file);
    if (storage.existsSync(filePath)) {
      if (scrubFile(filePath)) {
        scrubbedFiles.push(file);
      }
    }
  }
  
  // Scrub agent history files
  const agentsDir = path.join(dir, 'agents');
  if (storage.existsSync(agentsDir)) {
    try {
      for (const agentName of storage.listSync(agentsDir)) {
        const historyPath = path.join(agentsDir, agentName, 'history.md');
        if (storage.existsSync(historyPath)) {
          if (scrubFile(historyPath)) {
            scrubbedFiles.push(path.join('agents', agentName, 'history.md'));
          }
        }
      }
    } catch {
      // Ignore errors reading agents directory
    }
  }
  
  // Scrub log files
  const logDir = path.join(dir, 'log');
  if (storage.existsSync(logDir)) {
    try {
      const logFiles = storage.listSync(logDir)
        .filter(f => f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.log'));
      
      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        if (scrubFile(filePath)) {
          scrubbedFiles.push(path.join('log', file));
        }
      }
    } catch {
      // Ignore errors reading log directory
    }
  }
  
  return scrubbedFiles.length;
}

/**
 * Scrub emails from a single file
 * Returns true if file was modified
 */
function scrubFile(filePath: string): boolean {
  try {
    let content = storage.readSync(filePath) ?? '';
    let modified = false;
    
    // Replace "name (email)" → "name"
    const beforeNameEmail = content;
    content = content.replace(NAME_WITH_EMAIL_PATTERN, '$1');
    if (content !== beforeNameEmail) modified = true;
    
    // Replace bare emails in identity contexts (preserve in URLs and code)
    const lines = content.split('\n');
    const scrubbed = lines.map(line => {
      // Skip lines that look like URLs, code blocks, or examples
      if (line.includes('http://') || line.includes('https://') || 
          line.includes('```') || line.includes('example.com') ||
          line.trim().startsWith('//') || line.trim().startsWith('#')) {
        return line;
      }
      
      const before = line;
      const after = line.replace(EMAIL_PATTERN, '[email scrubbed]');
      if (before !== after) modified = true;
      return after;
    });
    
    if (modified) {
      storage.writeSync(filePath, scrubbed.join('\n'));
    }
    
    return modified;
  } catch {
    return false;
  }
}
