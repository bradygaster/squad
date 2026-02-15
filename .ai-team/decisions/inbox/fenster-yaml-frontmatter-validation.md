### 2026-02-14: Copilot CLI agent manifest YAML frontmatter must use only supported properties

**By:** Fenster

**What:** The `version` field was removed from squad.agent.md's YAML frontmatter because it is not a supported property per the GitHub Copilot CLI agent manifest specification. Version tracking was moved to an HTML comment format.

**Why:** Unsupported YAML frontmatter properties (like `version`, `model`, `argument-hint`, `handoffs`) cause the Copilot CLI parser to display "error: too many arguments" above the textbox in the CLI. The parser interprets unsupported properties as command-line arguments, resulting in a persistent error message that degrades UX. The only supported properties for GitHub Copilot CLI agents are: `name`, `description`, `tools`, and `mcp-servers` (org/enterprise level only). Moving version to an HTML comment preserves version tracking without conflicting with the parser.

**Reference:** https://docs.github.com/en/copilot/reference/custom-agents-configuration

**Impact:** All custom agent manifests should validate their YAML frontmatter against the official specification. Version or other metadata that isn't supported should be tracked in HTML comments or the Markdown body, not in YAML.
