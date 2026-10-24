/**
 * Error handling utilities — zero dependencies
 */

/**
 * Error class for fatal CLI errors.
 * CLI entry points catch these and call process.exit(1).
 * Library consumers can catch the SquadError normally.
 */
export class SquadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SquadError';
  }
}

/**
 * Throw a fatal error. In CLI context, the entry point catches and exits.
 * In library context, callers can catch the SquadError normally.
 */
/**
 * The one message every project-scoped command prints when run outside a project
 * (no `.squad/` from the current directory up to the repository root). Byte-identical
 * across commands; tests assert equality.
 */
export const NO_SQUAD_MESSAGE = 'No squad in this directory. Run "squad init" first.';

/** Fail with {@link NO_SQUAD_MESSAGE}. */
export function fatalNoSquad(): never {
  return fatal(NO_SQUAD_MESSAGE);
}

export function fatal(msg: string): never {
  throw new SquadError(msg);
}
