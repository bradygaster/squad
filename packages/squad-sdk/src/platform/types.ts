/**
 * Platform-agnostic interfaces for multi-platform support.
 * Allows Squad to work with GitHub and Azure DevOps interchangeably.
 *
 * @module platform/types
 */

export type PlatformType = 'github' | 'azure-devops' | 'planner';

/** Where work items are tracked — may differ from where code lives */
export type WorkItemSource = 'github' | 'azure-devops' | 'planner';

/** Hybrid config: repo on one platform, work items on another */
export interface HybridPlatformConfig {
  repo: PlatformType;
  workItems: WorkItemSource;
}

/** Normalized work item — maps to GitHub Issues or ADO Work Items */
export interface WorkItem {
  id: number;
  title: string;
  state: string;
  tags: string[];
  assignedTo?: string;
  url: string;
}

/** Normalized pull request — maps to GitHub PRs or ADO PRs */
export interface PullRequest {
  id: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'active' | 'completed' | 'abandoned' | 'draft';
  reviewStatus?: 'approved' | 'changes-requested' | 'pending';
  author: string;
  url: string;
}

/** Platform adapter interface — implemented by GitHub and ADO adapters */
export interface PlatformAdapter {
  readonly type: PlatformType;

  // Work Items / Issues
  listWorkItems(options: { tags?: string[]; state?: string; limit?: number }): Promise<WorkItem[]>;
  getWorkItem(id: number): Promise<WorkItem>;
  createWorkItem(options: { title: string; description?: string; tags?: string[]; assignedTo?: string; type?: string }): Promise<WorkItem>;
  addTag(workItemId: number, tag: string): Promise<void>;
  removeTag(workItemId: number, tag: string): Promise<void>;
  addComment(workItemId: number, comment: string): Promise<void>;

  /** Ensure a tag/label exists (creates it if missing). No-op on platforms with auto-created tags. */
  ensureTag?(tag: string, options?: { color?: string; description?: string }): Promise<void>;

  /**
   * Verify and repair authentication context for the current repository.
   * If preferredUser is provided, switch to that account directly.
   * Otherwise, try to auto-detect from the remote URL (works for EMU repos
   * where org name = account name, but not for repos where owner ≠ your account).
   * No-op if auth is already correct. Non-fatal — never throws.
   */
  ensureAuth?(preferredUser?: string): Promise<void>;

  // Pull Requests
  listPullRequests(options: { status?: string; limit?: number }): Promise<PullRequest[]>;
  createPullRequest(options: {
    title: string;
    sourceBranch: string;
    targetBranch: string;
    description?: string;
  }): Promise<PullRequest>;
  mergePullRequest(id: number): Promise<void>;

  // Branches
  createBranch(name: string, fromBranch?: string): Promise<void>;
}

// ─── Communication Adapter ────────────────────────────────────────────

/** Where communication happens — which channel/service */
export type CommunicationChannel = 'github-discussions' | 'ado-work-items' | 'teams-webhook' | 'file-log';

/** A reply from a human on a communication channel */
export interface CommunicationReply {
  author: string;
  body: string;
  timestamp: Date;
  /** Platform-specific identifier for the reply */
  id: string;
}

/** Configuration for a communication channel */
export interface CommunicationConfig {
  channel: CommunicationChannel;
  /** Post session summaries after agent work */
  postAfterSession?: boolean;
  /** Post decisions that need human review */
  postDecisions?: boolean;
  /** Post escalations when agents are blocked */
  postEscalations?: boolean;
  /** Teams-specific configuration */
  teams?: {
    tenantId?: string;
    clientId?: string;
    recipientUpn?: string;
    chatId?: string;
    channelId?: string;
    teamId?: string;
  };
}

/**
 * Communication adapter interface — pluggable agent-human communication.
 *
 * Abstracts the communication channel so Squad can post updates and read
 * replies from GitHub Discussions, ADO Work Item discussions, Teams, or
 * plain log files — depending on what the user has configured.
 */
export interface CommunicationAdapter {
  readonly channel: CommunicationChannel;

  /**
   * Post an update to the communication channel.
   * Used by Scribe (session summaries), Ralph (board status), and agents (escalations).
   */
  postUpdate(options: {
    title: string;
    body: string;
    category?: string;
    /** Agent or role posting the update */
    author?: string;
  }): Promise<{ id: string; url?: string }>;

  /**
   * Poll for replies since a given timestamp.
   * Returns new replies from humans on the channel.
   */
  pollForReplies(options: {
    /** Thread/discussion ID to check for replies */
    threadId: string;
    since: Date;
  }): Promise<CommunicationReply[]>;

  /**
   * Get a URL that humans can open on any device (phone, browser, desktop).
   * Returns undefined if the channel has no web UI (e.g., file-log).
   */
  getNotificationUrl(threadId: string): string | undefined;
}
