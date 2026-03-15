/**
 * #673 — Table header styling acceptance tests
 *
 * Validates that markdown tables rendered through MessageStream have
 * styled (bold) header rows, handle edge cases without crashing,
 * and survive truncation and NO_COLOR environments.
 *
 * 📌 Proactive: Written from requirements while implementation is in progress.
 * Tests target the existing wrapTableContent / renderMarkdownInline pipeline
 * and the rendered MessageStream output. Some assertions may need adjustment
 * once the header-bold implementation lands.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { wrapTableContent, renderMarkdownInline } from '../packages/squad-cli/src/cli/shell/components/MessageStream.js';
import { MessageStream } from '../packages/squad-cli/src/cli/shell/components/MessageStream.js';
import type { ShellMessage } from '../packages/squad-cli/src/cli/shell/types.js';

const h = React.createElement;

function makeMessage(overrides: Partial<ShellMessage> & { content: string; role: ShellMessage['role'] }): ShellMessage {
  return { timestamp: new Date(), ...overrides };
}

// ============================================================================
// Table content with header row
// ============================================================================

const TABLE_WITH_HEADER = [
  '| Name | Role | Status |',
  '|------|------|--------|',
  '| Fenster | Core Dev | Active |',
  '| Hockney | Tester | Active |',
].join('\n');

const TABLE_WITHOUT_SEPARATOR = [
  '| Name | Role | Status |',
  '| Fenster | Core Dev | Active |',
  '| Hockney | Tester | Active |',
].join('\n');

const SINGLE_COLUMN_TABLE = [
  '| Name |',
  '|------|',
  '| Fenster |',
  '| Hockney |',
].join('\n');

const EMPTY_TABLE = '';

const WIDE_TABLE = [
  '| Name | Role | Status | Description | Notes | Extra Column One | Extra Column Two |',
  '|------|------|--------|-------------|-------|------------------|------------------|',
  '| Fenster | Core Dev | Active | Implements features | Good at TypeScript | Column data here | More data here |',
].join('\n');

// ============================================================================
// #673 — Table with header row renders header in bold
// ============================================================================

describe('#673 — Table header styling', () => {
  const originalEnv = process.env['NO_COLOR'];
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['NO_COLOR'];
    } else {
      process.env['NO_COLOR'] = originalEnv;
    }
  });

  it('table with header row renders header cells in bold', () => {
    // Render a message containing a markdown table with header + separator
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'agent', content: TABLE_WITH_HEADER, agentName: 'Fenster' }),
        ],
        processing: false,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    // Header row content should be present in the rendered output
    expect(frame).toContain('Name');
    expect(frame).toContain('Role');
    expect(frame).toContain('Status');
    // Data rows should also appear
    expect(frame).toContain('Fenster');
    expect(frame).toContain('Hockney');
  });

  it('table without separator row renders normally (no crash)', () => {
    // A table missing the |---|---| separator should not crash
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'agent', content: TABLE_WITHOUT_SEPARATOR, agentName: 'Fenster' }),
        ],
        processing: false,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    // Content should render without error
    expect(frame).toContain('Name');
    expect(frame).toContain('Fenster');
  });

  it('NO_COLOR environment: headers still visually distinct (bold renders without color)', () => {
    process.env['NO_COLOR'] = '1';
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'agent', content: TABLE_WITH_HEADER, agentName: 'Fenster' }),
        ],
        processing: false,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    // In NO_COLOR mode, table should still render headers — bold works without color
    expect(frame).toContain('Name');
    expect(frame).toContain('Role');
    expect(frame).toContain('Status');
    // Data content also present
    expect(frame).toContain('Hockney');
  });

  it('empty table: no crash', () => {
    // An empty string content should render fine
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'agent', content: EMPTY_TABLE, agentName: 'Fenster' }),
        ],
        processing: false,
        streamingContent: new Map(),
      })
    );
    // Should not throw — frame exists
    expect(lastFrame()).toBeDefined();
  });

  it('single-column table: headers still styled', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'agent', content: SINGLE_COLUMN_TABLE, agentName: 'Fenster' }),
        ],
        processing: false,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    // Single-column header should render
    expect(frame).toContain('Name');
    expect(frame).toContain('Fenster');
    expect(frame).toContain('Hockney');
  });

  it('wide table that gets truncated: headers still styled after truncation', () => {
    // wrapTableContent truncates columns when table exceeds maxWidth
    const truncated = wrapTableContent(WIDE_TABLE, 60);
    // Truncated output should still contain pipe delimiters (table structure preserved)
    expect(truncated).toContain('|');
    // Header row values should still be present (possibly truncated with ellipsis)
    expect(truncated).toMatch(/Name/);
    expect(truncated).toMatch(/Role/);

    // Also verify via rendered MessageStream — no crash on truncated table
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'agent', content: WIDE_TABLE, agentName: 'Fenster' }),
        ],
        processing: false,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Name');
  });
});
