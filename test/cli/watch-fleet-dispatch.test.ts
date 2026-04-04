import { describe, it, expect } from 'vitest';
import { classifyIssue } from '../../packages/squad-cli/src/cli/commands/watch/index.js';

describe('classifyIssue - dispatch-mode categories', () => {
  it('classifies read-heavy keywords correctly', () => {
    const readTitles = [
      'Research: evaluate new auth library',
      'Review PR #100 security changes',
      'Analyze CI pipeline performance',
      'Investigate flaky test failures',
      'Audit dependency licenses',
    ];
    for (const title of readTitles) {
      expect(classifyIssue(title)).toBe('read');
    }
  });

  it('classifies write-heavy keywords correctly', () => {
    const writeTitles = [
      'Fix memory leak in WebSocket handler',
      'Implement rate limiting middleware',
      'Add OpenAPI spec generation',
      'Build webhook retry mechanism',
      'Refactor auth module for clarity',
    ];
    for (const title of writeTitles) {
      expect(classifyIssue(title)).toBe('write');
    }
  });

  it('defaults to write when both read and write keywords present', () => {
    expect(classifyIssue('Review and fix the auth module')).toBe('write');
  });

  it('defaults to write for ambiguous titles with no keywords', () => {
    expect(classifyIssue('Something about the codebase')).toBe('write');
  });

  it('is case-insensitive', () => {
    expect(classifyIssue('RESEARCH new approach')).toBe('read');
    expect(classifyIssue('FIX broken tests')).toBe('write');
  });
});