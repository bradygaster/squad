/**
 * State Module — Agent Handle Implementation
 *
 * Concrete implementation of the `AgentHandle` interface from collection-map.ts.
 * Wires up to StorageProvider + IO layer for reading/writing agent state.
 *
 * @module state/handles
 */

import type { StorageProvider } from '../storage/storage-provider.js';
import type { AgentHandle } from './collection-map.js';
import type { Agent, HistoryEntry, HistorySection } from './domain-types.js';
import type { ParsedHistory } from '../agents/history-shadow.js';
import { parseHistory, serializeHistoryAppend } from './io/history-io.js';
import { parseTeam, serializeTeam } from './io/team-io.js';
import { NotFoundError, ParseError } from './domain-types.js';
import { resolveCollectionPath } from './schema.js';

// ── History Section Mapping ────────────────────────────────────────────────

const SECTION_KEYS: Array<{ section: HistorySection; key: keyof ParsedHistory }> = [
  { section: 'Context', key: 'context' },
  { section: 'Learnings', key: 'learnings' },
  { section: 'Decisions', key: 'decisions' },
  { section: 'Patterns', key: 'patterns' },
  { section: 'Issues', key: 'issues' },
  { section: 'References', key: 'references' },
];

/**
 * Convert a ParsedHistory into an array of HistoryEntry objects.
 *
 * Splits each section's content by `### date/title` sub-headers into
 * individual entries with extracted timestamps.
 */
function parsedHistoryToEntries(
  parsed: ParsedHistory,
  filterSection?: HistorySection,
): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const sections = filterSection
    ? SECTION_KEYS.filter((s) => s.section === filterSection)
    : SECTION_KEYS;

  for (const { section, key } of sections) {
    const content = parsed[key] as string | undefined;
    if (!content) continue;

    const subHeaderRegex = /^###\s+(.+)$/gm;
    const subHeaders: Array<{ title: string; start: number; contentStart: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = subHeaderRegex.exec(content)) !== null) {
      subHeaders.push({
        title: m[1]!,
        start: m.index,
        contentStart: m.index + m[0].length,
      });
    }

    if (subHeaders.length === 0) {
      entries.push({ section, content: content.trim(), timestamp: '' });
    } else {
      for (let i = 0; i < subHeaders.length; i++) {
        const hdr = subHeaders[i]!;
        const nextHdr = subHeaders[i + 1];
        const start = hdr.contentStart;
        const end = nextHdr ? nextHdr.start : content.length;
        const entryContent = content.substring(start, end).trim();
        const dateMatch = hdr.title.match(/(\d{4}-\d{2}-\d{2})/);
        const timestamp = dateMatch?.[1] ?? '';
        entries.push({ section, content: entryContent, timestamp });
      }
    }
  }

  return entries;
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a concrete AgentHandle bound to a specific agent, storage provider,
 * and root directory.
 */
export function createAgentHandle(
  name: string,
  storage: StorageProvider,
  rootDir: string,
): AgentHandle {
  const agentDir = `${rootDir}/.squad/agents/${name}`;
  const charterPath = `${agentDir}/charter.md`;
  const historyPath = `${agentDir}/history.md`;
  const teamPath = `${rootDir}/${resolveCollectionPath('team')}`;

  const handle: AgentHandle = {
    name,

    async charter(): Promise<string> {
      const content = await storage.read(charterPath);
      if (content === undefined) {
        throw new NotFoundError('agents', name);
      }
      return content;
    },

    history(section?: HistorySection): Promise<HistoryEntry[]> {
      return (async () => {
        const content = await storage.read(historyPath);
        if (content === undefined) {
          return [];
        }
        let parsed;
        try {
          parsed = parseHistory(content);
        } catch (err) {
          throw new ParseError('history', err instanceof Error ? err.message : String(err), { cause: err });
        }
        return parsedHistoryToEntries(parsed, section);
      })();
    },

    async appendHistory(section: HistorySection, entry: HistoryEntry): Promise<void> {
      const content = await storage.read(historyPath);
      const fragment = serializeHistoryAppend(
        section,
        entry.content,
        entry.timestamp || undefined,
      );

      if (content === undefined) {
        const newContent = `# ${name}\n\n## ${section}\n\n${fragment}`;
        await storage.write(historyPath, newContent);
        return;
      }

      const sectionRegex = new RegExp(`^## ${section}\\s*$`, 'm');
      const sectionMatch = sectionRegex.exec(content);

      if (sectionMatch) {
        // Find next ## header after this section to determine insertion point
        const afterHeader = sectionMatch.index + sectionMatch[0].length;
        const rest = content.substring(afterHeader);
        const nextSectionMatch = /^## /m.exec(rest.length > 1 ? rest.substring(1) : '');

        const insertPos = nextSectionMatch
          ? afterHeader + 1 + nextSectionMatch.index
          : content.length;

        const before = content.substring(0, insertPos).trimEnd();
        const after = content.substring(insertPos);
        const newContent =
          before + '\n\n' + fragment + (after.trim() ? '\n' + after.trimStart() : '');
        await storage.write(historyPath, newContent.trimEnd() + '\n');
      } else {
        // Section doesn't exist yet — append at end
        const newContent = content.trimEnd() + `\n\n## ${section}\n\n${fragment}`;
        await storage.write(historyPath, newContent.trimEnd() + '\n');
      }
    },

    async update(updates: Partial<Agent>): Promise<void> {
      const teamContent = await storage.read(teamPath);
      if (teamContent === undefined) {
        throw new NotFoundError('team');
      }

      let agents;
      try {
        agents = parseTeam(teamContent).agents;
      } catch (err) {
        throw new ParseError('team', err instanceof Error ? err.message : String(err), { cause: err });
      }
      const lowerName = name.toLowerCase();
      const idx = agents.findIndex((a) => a.name.toLowerCase() === lowerName);
      if (idx === -1) {
        throw new NotFoundError('agents', name);
      }

      const current = agents[idx]!;
      const updated = {
        name: updates.name ?? current.name,
        role: updates.role ?? current.role,
        skills: updates.skills ? [...updates.skills] : current.skills,
        model: updates.modelPreference ?? current.model,
        status: updates.status !== undefined ? String(updates.status) : current.status,
      };
      agents[idx] = updated;

      const serialized = serializeTeam(agents);
      await storage.write(teamPath, serialized);
    },
  };

  return handle;
}
