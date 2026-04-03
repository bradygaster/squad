import { describe, it, expect } from 'vitest';
import { classifyIssue } from '../packages/squad-cli/src/cli/commands/watch/capabilities/execute.js';

describe('classifyIssue', () => {
  it('classifies research issues as read', () => {
    expect(classifyIssue('Research: evaluate new auth library')).toBe('read');
  });

  it('classifies review issues as read', () => {
    expect(classifyIssue('Review PR #100 security changes')).toBe('read');
  });

  it('classifies fix issues as write', () => {
    expect(classifyIssue('Fix memory leak in WebSocket handler')).toBe('write');
  });

  it('classifies implement issues as write', () => {
    expect(classifyIssue('Implement rate limiting middleware')).toBe('write');
  });

  it('classifies analyze issues as read', () => {
    expect(classifyIssue('Analyze CI pipeline performance')).toBe('read');
  });

  it('classifies add issues as write', () => {
    expect(classifyIssue('Add OpenAPI spec generation')).toBe('write');
  });

  it('classifies investigate issues as read', () => {
    expect(classifyIssue('Investigate flaky test failures')).toBe('read');
  });

  it('classifies build issues as write', () => {
    expect(classifyIssue('Build webhook retry mechanism')).toBe('write');
  });

  it('defaults to write for ambiguous titles', () => {
    expect(classifyIssue('Something about the codebase')).toBe('write');
  });

  it('defaults to write when both read and write keywords present', () => {
    expect(classifyIssue('Review and fix the auth module')).toBe('write');
  });

  it('is case-insensitive', () => {
    expect(classifyIssue('RESEARCH new approach')).toBe('read');
    expect(classifyIssue('FIX broken tests')).toBe('write');
  });
});
