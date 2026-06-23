/**
 * State Module — SquadState Facade
 *
 * Top-level typed API for reading and writing `.squad/` state.
 * Composes the collection facades (agents, decisions, routing, team)
 * over a pluggable StorageProvider.
 *
 * @module state/squad-state
 */

import type { StorageProvider } from '../storage/storage-provider.js';
import {
  AgentsCollection,
  ConfigCollection,
  DecisionsCollection,
  LogCollection,
  RoutingCollection,
  SkillsCollection,
  TeamCollection,
  TemplatesCollection,
} from './collections.js';
import { NotFoundError } from './domain-types.js';

export class SquadState {
  readonly agents: AgentsCollection;
  readonly config: ConfigCollection;
  readonly decisions: DecisionsCollection;
  readonly routing: RoutingCollection;
  readonly team: TeamCollection;
  readonly skills: SkillsCollection;
  readonly templates: TemplatesCollection;
  readonly log: LogCollection;

  private constructor(
    private readonly storage: StorageProvider,
    private readonly _rootDir: string,
  ) {
    this.agents = new AgentsCollection(storage, _rootDir);
    this.config = new ConfigCollection(storage, _rootDir);
    this.decisions = new DecisionsCollection(storage, _rootDir);
    this.routing = new RoutingCollection(storage, _rootDir);
    this.team = new TeamCollection(storage, _rootDir);
    this.skills = new SkillsCollection(storage, _rootDir);
    this.templates = new TemplatesCollection(storage, _rootDir);
    this.log = new LogCollection(storage, _rootDir);
  }

  /** The project root directory this SquadState is bound to. */
  get root(): string {
    return this._rootDir;
  }

  /** The underlying StorageProvider used by this instance. */
  get provider(): StorageProvider {
    return this.storage;
  }

  /**
   * Factory method — validates that `rootDir/.squad/` exists before
   * returning a new SquadState instance.
   */
  static async create(
    storage: StorageProvider,
    rootDir: string,
  ): Promise<SquadState> {
    const squadDir = `${rootDir}/.squad`;
    const exists = await storage.exists(squadDir);
    if (!exists) {
      throw new NotFoundError('squad', rootDir);
    }
    return new SquadState(storage, rootDir);
  }

  /**
   * Synchronous factory — creates SquadState without validating `.squad/`
   * existence.  For internal SDK use where the caller already knows the
   * root is initialized (e.g., modules operating on an existing project).
   */
  static fromStorage(
    storage: StorageProvider,
    rootDir: string,
  ): SquadState {
    return new SquadState(storage, rootDir);
  }

  /** Check if a `.squad/` directory exists at the root. */
  async isInitialized(): Promise<boolean> {
    return this.storage.exists(`${this._rootDir}/.squad`);
  }
}
