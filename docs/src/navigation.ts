export interface NavItem {
  title: string;
  slug: string;
}

export interface NavSection {
  title: string;
  dir: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Get Started',
    dir: 'get-started',
    items: [
      { title: 'Quick start', slug: 'get-started/five-minute-start' },
      { title: 'Installation', slug: 'get-started/installation' },
      { title: 'Choose your path', slug: 'get-started/choosing-your-path' },
      { title: 'Your First Session', slug: 'get-started/first-session' },
      { title: 'Migration Guide', slug: 'get-started/migration' },
    ],
  },
  {
    title: 'Guide',
    dir: 'guide',
    items: [
      { title: 'Tips & Tricks', slug: 'guide/tips-and-tricks' },
      { title: 'Sample Prompts', slug: 'guide/sample-prompts' },
      { title: 'Personal Squad', slug: 'guide/personal-squad' },
      { title: 'Interactive Shell', slug: 'guide/shell' },
      { title: 'Extensibility', slug: 'guide/extensibility' },
      { title: 'Building Extensions', slug: 'guide/building-extensions' },
      { title: 'Building Resilient Agents', slug: 'guide/building-resilient-agents' },
      { title: 'Contributing', slug: 'guide/contributing' },
      { title: 'Contributors', slug: 'guide/contributors' },
    ],
  },
  {
    title: 'Features',
    dir: 'features',
    items: [
      { title: 'Team Setup', slug: 'features/team-setup' },
      { title: 'Work Routing', slug: 'features/routing' },
      { title: 'Model Selection', slug: 'features/model-selection' },
      { title: 'Response Modes', slug: 'features/response-modes' },
      { title: 'Parallel Execution', slug: 'features/parallel-execution' },
      { title: 'Memory', slug: 'features/memory' },
      { title: 'Skills', slug: 'features/skills' },
      { title: 'Directives', slug: 'features/directives' },
      { title: 'Ceremonies', slug: 'features/ceremonies' },
      { title: 'Reviewer Protocol', slug: 'features/reviewer-protocol' },
      { title: 'GitHub Issues', slug: 'features/github-issues' },
      { title: 'GitLab Issues', slug: 'features/gitlab-issues' },
      { title: 'Labels & Triage', slug: 'features/labels' },
      { title: 'PRD Mode', slug: 'features/prd-mode' },
      { title: 'Project Boards', slug: 'features/project-boards' },
      { title: 'Ralph — Work Monitor', slug: 'features/ralph' },
      { title: '@copilot Coding Agent', slug: 'features/copilot-coding-agent' },
      { title: 'Human Team Members', slug: 'features/human-team-members' },
      { title: 'Consult Mode', slug: 'features/consult-mode' },
      { title: 'Remote Control', slug: 'features/remote-control' },
      { title: 'Storage Provider', slug: 'features/storage-provider' },
      { title: 'VS Code', slug: 'features/vscode' },
      { title: 'Git Worktrees', slug: 'features/worktrees' },
      { title: 'Export & Import', slug: 'features/export-import' },
      { title: 'Upstream Inheritance', slug: 'features/upstream-inheritance' },
      { title: 'Marketplace', slug: 'features/marketplace' },
      { title: 'Plugins', slug: 'features/plugins' },
      { title: 'MCP', slug: 'features/mcp' },
      { title: 'Notifications', slug: 'features/notifications' },
      { title: 'Enterprise Platforms', slug: 'features/enterprise-platforms' },
      { title: 'Squad RC', slug: 'features/squad-rc' },
      { title: 'Streams', slug: 'features/streams' },
      { title: 'Distributed Mesh', slug: 'features/distributed-mesh' },
      { title: 'Capability Routing', slug: 'features/capability-routing' },
      { title: 'Rate Limiting', slug: 'features/rate-limiting' },
      { title: 'KEDA Autoscaling', slug: 'features/keda-scaling' },
    ],
  },
  {
    title: 'Reference',
    dir: 'reference',
    items: [
      { title: 'CLI', slug: 'reference/cli' },
      { title: 'SDK', slug: 'reference/sdk' },
      { title: 'SDK API Reference', slug: 'reference/api' },
      { title: 'SDK Integration', slug: 'reference/integration' },
      { title: 'Tools & Hooks', slug: 'reference/tools-and-hooks' },
      { title: 'Config', slug: 'reference/config' },
      { title: 'Pluggable Interfaces', slug: 'reference/pluggable-interfaces' },
      { title: 'Platform Adapters', slug: 'reference/platform-adapters' },
      { title: 'Communication Adapters', slug: 'reference/communication-adapters' },
      { title: 'State Backends', slug: 'reference/state-backends' },
      { title: 'Schedule Providers', slug: 'reference/schedule-providers' },
      { title: 'Glossary', slug: 'reference/glossary' },
    ],
  },
  {
    title: 'Scenarios',
    dir: 'scenarios',
    items: [
      { title: 'Existing Repo', slug: 'scenarios/existing-repo' },
      { title: 'New Project', slug: 'scenarios/new-project' },
      { title: 'Solo Developer', slug: 'scenarios/solo-dev' },
      { title: 'Issue-Driven Dev', slug: 'scenarios/issue-driven-dev' },
      { title: 'Monorepo', slug: 'scenarios/monorepo' },
      { title: 'CI/CD Integration', slug: 'scenarios/ci-cd-integration' },
      { title: 'Team of Humans', slug: 'scenarios/team-of-humans' },
      { title: 'Large Codebase', slug: 'scenarios/large-codebase' },
      { title: 'Open Source', slug: 'scenarios/open-source' },
      { title: 'Multiple Squads', slug: 'scenarios/multiple-squads' },
      { title: 'Keep My Squad', slug: 'scenarios/keep-my-squad' },
      { title: 'Mid-Project', slug: 'scenarios/mid-project' },
      { title: 'Upgrading', slug: 'scenarios/upgrading' },
      { title: 'Multi-Codespace', slug: 'scenarios/multi-codespace' },
      { title: 'Private Repos', slug: 'scenarios/private-repos' },
      { title: 'Cross-Org Auth', slug: 'scenarios/cross-org-auth' },
      { title: 'Team Portability', slug: 'scenarios/team-portability' },
      { title: 'Team State Storage', slug: 'scenarios/team-state-storage' },
      { title: 'Switching Models', slug: 'scenarios/switching-models' },
      { title: 'Release Process', slug: 'scenarios/release-process' },
      { title: 'Scaling Workstreams', slug: 'scenarios/scaling-workstreams' },
      { title: 'Client Compatibility', slug: 'scenarios/client-compatibility' },
      { title: 'Remote Q&A', slug: 'scenarios/remote-qa' },
      { title: 'Disaster Recovery', slug: 'scenarios/disaster-recovery' },
      { title: 'Troubleshooting', slug: 'scenarios/troubleshooting' },
      { title: 'Aspire Dashboard', slug: 'scenarios/aspire-dashboard' },
    ],
  },
  {
    title: 'Concepts',
    dir: 'concepts',
    items: [
      { title: 'Architecture', slug: 'concepts/architecture' },
      { title: 'Your Team', slug: 'concepts/your-team' },
      { title: 'Memory & Knowledge', slug: 'concepts/memory-and-knowledge' },
      { title: 'Parallel Work', slug: 'concepts/parallel-work' },
      { title: 'GitHub Workflow', slug: 'concepts/github-workflow' },
      { title: 'Portability', slug: 'concepts/portability' },
    ],
  },
  {
    title: 'Cookbook',
    dir: 'cookbook',
    items: [
      { title: 'Recipes', slug: 'cookbook/recipes' },
    ],
  },
];

export const STANDALONE_PAGES = [
  { title: "What's New", slug: 'whatsnew' },
  { title: 'SDK-First Mode', slug: 'sdk-first-mode' },
  { title: 'Community', slug: 'community' },
  { title: 'Insider Program', slug: 'insider-program' },
];

