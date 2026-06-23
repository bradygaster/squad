/**
 * Unit tests for pure helpers exported from the Teams communication adapter.
 */

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  stripHtml,
  formatTeamsMessage,
  parseTokens,
  base64url,
  validateGraphId,
  TeamsCommunicationAdapter,
} from '../packages/squad-sdk/src/platform/comms-teams.js';

// ─── escapeHtml ──────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('passes through normal text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes all special chars in one string', () => {
    expect(escapeHtml('<b>"Tom & Jerry"</b>')).toBe(
      '&lt;b&gt;&quot;Tom &amp; Jerry&quot;&lt;/b&gt;',
    );
  });
});

// ─── stripHtml ───────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
  });

  it('removes nested tags', () => {
    expect(stripHtml('<div><p>nested</p></div>')).toBe('nested');
  });

  it('decodes &nbsp; to space', () => {
    expect(stripHtml('hello&nbsp;world')).toBe('hello world');
  });

  it('decodes &amp; to &', () => {
    expect(stripHtml('a&amp;b')).toBe('a&b');
  });

  it('decodes &lt; to <', () => {
    expect(stripHtml('a&lt;b')).toBe('a<b');
  });

  it('decodes &gt; to >', () => {
    expect(stripHtml('a&gt;b')).toBe('a>b');
  });

  it('decodes &quot; to "', () => {
    expect(stripHtml('say &quot;hi&quot;')).toBe('say "hi"');
  });

  it('trims whitespace', () => {
    expect(stripHtml('  hello  ')).toBe('hello');
  });

  it('handles combined tags and entities', () => {
    expect(stripHtml('<p>Tom &amp; Jerry &lt;3</p>')).toBe('Tom & Jerry <3');
  });
});

// ─── formatTeamsMessage ──────────────────────────────────────────────

describe('formatTeamsMessage', () => {
  it('formats without author', () => {
    const result = formatTeamsMessage('Title', 'Body text');
    expect(result).toContain('<b>Title</b>');
    expect(result).toContain('Body text');
    expect(result).not.toContain('<em>');
  });

  it('formats with author', () => {
    const result = formatTeamsMessage('Title', 'Body', 'Alice');
    expect(result).toContain('<em>Posted by Alice</em>');
  });

  it('converts newlines in body to <br/>', () => {
    const result = formatTeamsMessage('T', 'line1\nline2');
    expect(result).toContain('line1<br/>line2');
  });

  it('escapes HTML in title and body', () => {
    const result = formatTeamsMessage('<script>', 'a & b');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('a &amp; b');
  });

  it('escapes HTML in author name', () => {
    const result = formatTeamsMessage('T', 'B', '<img>');
    expect(result).toContain('&lt;img&gt;');
  });
});

// ─── parseTokens ─────────────────────────────────────────────────────

describe('parseTokens', () => {
  it('maps TokenResponse fields to StoredTokens', () => {
    const now = Date.now();
    const result = parseTokens({
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      expires_in: 3600,
    });

    expect(result.accessToken).toBe('access-123');
    expect(result.refreshToken).toBe('refresh-456');
    // expiresAt should be roughly now + 3600*1000
    expect(result.expiresAt).toBeGreaterThanOrEqual(now + 3600 * 1000 - 1000);
    expect(result.expiresAt).toBeLessThanOrEqual(now + 3600 * 1000 + 1000);
  });

  it('handles short expiry', () => {
    const now = Date.now();
    const result = parseTokens({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 60,
    });
    expect(result.expiresAt).toBeGreaterThanOrEqual(now + 60 * 1000 - 1000);
    expect(result.expiresAt).toBeLessThanOrEqual(now + 60 * 1000 + 1000);
  });
});

// ─── base64url ───────────────────────────────────────────────────────

describe('base64url', () => {
  it('removes padding characters', () => {
    const result = base64url(Buffer.from([0xff]));
    expect(result).not.toContain('=');
  });

  it('replaces + with -', () => {
    const result = base64url(Buffer.from([0xfb, 0xef]));
    expect(result).not.toContain('+');
  });

  it('replaces / with _', () => {
    const result = base64url(Buffer.from([0xff, 0xff]));
    expect(result).not.toContain('/');
  });

  it('encodes known value correctly', () => {
    const result = base64url(Buffer.from('Hello'));
    expect(result).toBe('SGVsbG8');
  });

  it('result is URL-safe', () => {
    const result = base64url(Buffer.from([0xff, 0xfb, 0xef, 0xbf, 0x00]));
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// ─── TeamsCommunicationAdapter ────────────────────────────────────────

describe('TeamsCommunicationAdapter', () => {
  it('has channel "teams-graph"', () => {
    const adapter = new TeamsCommunicationAdapter({});
    expect(adapter.channel).toBe('teams-graph');
  });

  it('exposes CommunicationAdapter interface methods', () => {
    const adapter = new TeamsCommunicationAdapter({});
    expect(typeof adapter.postUpdate).toBe('function');
    expect(typeof adapter.pollForReplies).toBe('function');
    expect(typeof adapter.getNotificationUrl).toBe('function');
  });

  it('returns a Teams deep-link URL from getNotificationUrl', () => {
    const adapter = new TeamsCommunicationAdapter({});
    const url = adapter.getNotificationUrl('19:abc@thread.v2');
    expect(url).toContain('https://teams.microsoft.com/l/chat/');
    expect(url).toContain('19%3Aabc%40thread.v2');
  });
});

// ─── validateGraphId ─────────────────────────────────────────────────

describe('validateGraphId', () => {
  it('accepts alphanumeric IDs', () => {
    expect(validateGraphId('abc123', 'test')).toBe('abc123');
  });

  it('accepts IDs with colons, dots, hyphens, and @', () => {
    expect(validateGraphId('user@domain.com', 'upn')).toBe('user%40domain.com');
  });

  it('rejects IDs with spaces', () => {
    expect(() => validateGraphId('has space', 'test')).toThrow('Invalid test');
  });

  it('rejects IDs with slashes', () => {
    expect(() => validateGraphId('../../etc', 'test')).toThrow('contains unsafe characters');
  });

  it('rejects IDs with single quotes', () => {
    expect(() => validateGraphId("id'injection", 'test')).toThrow('contains unsafe characters');
  });
});
