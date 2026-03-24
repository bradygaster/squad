/**
 * Extract an agent name from a task description string.
 * Tries multiple patterns in order of specificity:
 *   1. Emoji + name + colon at start (e.g. "🔧 EECOM: Fix auth module")
 *   2. Name + colon anywhere (e.g. "EECOM: Fix auth module")
 *   3. Fuzzy: any knownAgentName appears as a whole word (case-insensitive)
 *
 * @param description - The task description string
 * @param knownAgentNames - Lowercase agent names to match against
 * @returns Parsed agent name and task summary, or null if no match
 */
export function parseAgentFromDescription(
  description: string,
  knownAgentNames: string[],
): { agentName: string; taskSummary: string } | null {
  if (!description || typeof description !== 'string') return null;
  if (!knownAgentNames || knownAgentNames.length === 0) return null;

  // Pattern 1: optional leading non-whitespace (emoji) then whitespace then word + colon at start
  const leadingMatch = description.match(/^\S*\s*(\w+):/);
  const leadingName = leadingMatch?.[1];
  if (leadingName) {
    const candidate = leadingName.toLowerCase();
    if (knownAgentNames.includes(candidate)) {
      const taskSummary = description.replace(/^\S*\s*\w+:\s*/, '').slice(0, 60);
      return { agentName: candidate, taskSummary };
    }
  }

  // Pattern 2: word + colon anywhere in the string
  const anyColonMatch = description.match(/(\w+):/);
  const colonName = anyColonMatch?.[1];
  if (colonName) {
    const candidate = colonName.toLowerCase();
    if (knownAgentNames.includes(candidate)) {
      const afterColon = description.slice(
        (anyColonMatch.index ?? 0) + anyColonMatch[0].length,
      ).replace(/^\s*/, '').slice(0, 60);
      return { agentName: candidate, taskSummary: afterColon || description.slice(0, 60) };
    }
  }

  // Pattern 3: fuzzy — check if any known agent name appears as a word boundary match
  const descLower = description.toLowerCase();
  for (const name of knownAgentNames) {
    const idx = descLower.indexOf(name);
    if (idx !== -1) {
      // Verify word boundary: char before and after must be non-word or start/end
      const charBefore = idx > 0 ? description.charAt(idx - 1) : '';
      const charAfter = idx + name.length < description.length ? description.charAt(idx + name.length) : '';
      const before = idx === 0 || !/\w/.test(charBefore);
      const after = charAfter === '' || !/\w/.test(charAfter);
      if (before && after) {
        return { agentName: name, taskSummary: description.slice(0, 60) };
      }
    }
  }

  return null;
}
