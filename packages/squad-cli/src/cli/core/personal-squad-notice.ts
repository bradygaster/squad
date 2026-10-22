/**
 * Personal squads were removed in Squad 2.0. This module only *tells* the user
 * about leftovers from 1.x; it never reads agent content from, writes to, moves
 * or deletes the legacy directory. Migration is an explicit user action
 * (`squad export` from the old location, `squad import` into the project).
 *
 * @module cli/core/personal-squad-notice
 */

import { detectLegacyPersonalSquad, type LegacyPersonalSquadInfo } from '@bradygaster/squad-sdk';
import { BOLD, DIM, RESET, YELLOW } from './output.js';

export const PERSONAL_SQUAD_REMOVED_HEADLINE = 'Personal squads were removed in Squad 2.0.';

/**
 * Build the one-time migration notice. Pure: callers decide where to print it.
 *
 * @param info - what {@link detectLegacyPersonalSquad} found
 * @param teamRootPath - the configured `teamRoot` when it points at the legacy global root
 */
export function formatPersonalSquadMigrationNotice(info: LegacyPersonalSquadInfo, teamRootPath?: string | null): string[] {
  const lines: string[] = [`${YELLOW}${BOLD}⚠ ${PERSONAL_SQUAD_REMOVED_HEADLINE}${RESET}`];
  if (info.personalDir) {
    lines.push(`  Your personal squad at ${BOLD}${info.personalDir}${RESET} is untouched: Squad 2.0 never reads, writes or deletes it.`);
    lines.push(`  To keep agents from it, copy them into this project explicitly:`);
    lines.push(`${DIM}    squad export --output personal-squad.json   (run inside ${info.personalDir})${RESET}`);
    lines.push(`${DIM}    squad import personal-squad.json           (run inside this project)${RESET}`);
    lines.push(`  Delete the old directory yourself when you no longer need it.`);
  }
  if (info.teamRootPointsAtGlobal) {
    lines.push(`  This project's ${BOLD}.squad/config.json${RESET} has ${BOLD}teamRoot${RESET} = ${teamRootPath ?? '<global squad root>'}, which a 1.x "squad init" set automatically.`);
    lines.push(`  Squad 2.0 does not change it: remove the key to make this project self-contained, or keep it if the shared team root is intentional.`);
  }
  lines.push(`${DIM}  Details: docs → Upgrading → "Personal squads removed".${RESET}`);
  return lines;
}

/** Print the migration notice when 1.x leftovers exist; returns true when something was printed. */
export function printPersonalSquadMigrationNoticeIfNeeded(teamRoot?: string | null): boolean {
  const info = detectLegacyPersonalSquad(teamRoot);
  if (!info) return false;
  console.log();
  for (const line of formatPersonalSquadMigrationNotice(info, teamRoot)) console.log(line);
  console.log();
  return true;
}

/** `squad personal|consult|extract` no longer exist; say so and point at the migration path. */
export function printPersonalSquadRemovedNotice(command: string): void {
  console.error(`${YELLOW}${BOLD}squad ${command}${RESET}${YELLOW} was removed in Squad 2.0 along with personal squads.${RESET}`);
  const info = detectLegacyPersonalSquad();
  if (info) {
    for (const line of formatPersonalSquadMigrationNotice(info)) console.error(line);
  } else {
    console.error(`${DIM}  Agents live in the project's .squad/ now. Share them with "squad export" / "squad import".${RESET}`);
  }
}
