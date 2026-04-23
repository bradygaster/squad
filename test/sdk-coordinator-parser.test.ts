/**
 * Tests for coordinator parser functions — SDK import path.
 * Imports from @bradygaster/squad-sdk/runtime/coordinator-parser.
 *
 * @module test/sdk-coordinator-parser
 */

import { describe, it, expect } from 'vitest';
import {
  parseCoordinatorResponse,
  hasRosterEntries,
  formatConversationContext,
  type MessageLike,
} from '@bradygaster/squad-sdk/runtime/coordinator-parser';

describe('sdk-coordinator-parser', () => {
  // ---------- parseCoordinatorResponse ----------
  describe('parseCoordinatorResponse', () => {
    it('parses DIRECT response', () => {
      const result = parseCoordinatorResponse('DIRECT: The project uses TypeScript.');
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('The project uses TypeScript.');
    });

    it('parses ROUTE response with task and context', () => {
      const input = `ROUTE: Fenster
TASK: Fix the login validation bug
CONTEXT: The user reported a crash on submit`;
      const result = parseCoordinatorResponse(input);
      expect(result.type).toBe('route');
      expect(result.routes).toHaveLength(1);
      expect(result.routes![0]!.agent).toBe('Fenster');
      expect(result.routes![0]!.task).toBe('Fix the login validation bug');
      expect(result.routes![0]!.context).toBe('The user reported a crash on submit');
    });

    it('parses ROUTE response without context', () => {
      const input = `ROUTE: Dallas
TASK: Build the header component`;
      const result = parseCoordinatorResponse(input);
      expect(result.type).toBe('route');
      expect(result.routes![0]!.agent).toBe('Dallas');
      expect(result.routes![0]!.task).toBe('Build the header component');
      expect(result.routes![0]!.context).toBeUndefined();
    });

    it('parses MULTI response', () => {
      const input = `MULTI:
- Ripley: Review the architecture
- Kane: Implement the API endpoint
- Lambert: Write integration tests`;
      const result = parseCoordinatorResponse(input);
      expect(result.type).toBe('multi');
      expect(result.routes).toHaveLength(3);
      expect(result.routes![0]!.agent).toBe('Ripley');
      expect(result.routes![0]!.task).toBe('Review the architecture');
      expect(result.routes![2]!.agent).toBe('Lambert');
    });

    it('falls back to direct for unrecognized format', () => {
      const result = parseCoordinatorResponse('I will handle this myself.');
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('I will handle this myself.');
    });

    it('handles whitespace around DIRECT prefix', () => {
      const result = parseCoordinatorResponse('  DIRECT: trimmed  ');
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('trimmed');
    });

    it('handles empty MULTI with no bullet lines', () => {
      const result = parseCoordinatorResponse('MULTI:\n\n');
      expect(result.type).toBe('multi');
      expect(result.routes).toHaveLength(0);
    });
  });

  // ---------- hasRosterEntries ----------
  describe('hasRosterEntries', () => {
    it('returns true when Members section has data rows', () => {
      const content = `# Team

## Members
| Name | Role |
| --- | --- |
| Ripley | Lead |
| Dallas | Frontend |

## Other Section
`;
      expect(hasRosterEntries(content)).toBe(true);
    });

    it('returns false when Members section has only header', () => {
      const content = `## Members
| Name | Role |
| --- | --- |

## Other
`;
      expect(hasRosterEntries(content)).toBe(false);
    });

    it('returns false when no Members section exists', () => {
      const content = `# Team

Some text but no members section.
`;
      expect(hasRosterEntries(content)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasRosterEntries('')).toBe(false);
    });
  });

  // ---------- formatConversationContext ----------
  describe('formatConversationContext', () => {
    it('formats messages with role prefix', () => {
      const messages: MessageLike[] = [
        { role: 'user', content: 'Hello' },
        { role: 'agent', content: 'Hi there', agentName: 'Ripley' },
      ];
      const result = formatConversationContext(messages);
      expect(result).toBe('[user]: Hello\n[Ripley]: Hi there');
    });

    it('uses role when agentName is missing', () => {
      const messages: MessageLike[] = [
        { role: 'system', content: 'System initialized' },
      ];
      const result = formatConversationContext(messages);
      expect(result).toBe('[system]: System initialized');
    });

    it('truncates to maxMessages', () => {
      const messages: MessageLike[] = Array.from({ length: 30 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
      }));
      const result = formatConversationContext(messages, 5);
      const lines = result.split('\n');
      expect(lines).toHaveLength(5);
      expect(lines[0]).toContain('Message 25');
      expect(lines[4]).toContain('Message 29');
    });

    it('returns empty string for empty array', () => {
      expect(formatConversationContext([])).toBe('');
    });
  });
});
