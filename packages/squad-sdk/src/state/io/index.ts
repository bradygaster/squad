/**
 * State I/O barrel — Markdown parsers and serializers for .squad/ domain files.
 *
 * Each module handles round-trip I/O for a single document type:
 * parse(markdown) → typed object → serialize(object) → markdown.
 *
 * @module state/io
 */

// Charter I/O
export { parseCharter, serializeCharter } from './charter-io.js';
export type { ParsedCharter } from './charter-io.js';

// History I/O
export { parseHistory, serializeHistory, serializeHistoryAppend } from './history-io.js';
export type { ParsedHistory, HistorySection } from './history-io.js';

// Decisions I/O
export { parseDecisions, serializeDecision, serializeDecisions } from './decisions-io.js';
export type { ParsedDecision } from './decisions-io.js';

// Routing I/O
export { parseRouting, serializeRouting } from './routing-io.js';
export type { ParsedRoutingRule, ParsedRouting } from './routing-io.js';

// Team I/O
export { parseTeam, serializeTeam } from './team-io.js';
export type { ParsedAgent, TeamMetadata, ParsedTeam } from './team-io.js';
