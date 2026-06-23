/**
 * Preset type definitions for Squad presets system.
 *
 * A preset is a curated collection of agents that can be applied to any
 * squad project. Presets live in `<squad-home>/presets/<name>/`.
 *
 * @module presets/types
 */

/**
 * Agent definition within a preset manifest.
 */
export interface PresetAgent {
  /** Agent name (used as directory name) */
  name: string;
  /** Agent role (e.g. 'lead', 'reviewer', 'devrel') */
  role: string;
  /** Short description of this agent's purpose */
  description?: string;
}

/**
 * Preset manifest — describes a preset and its agents.
 * Stored as `preset.json` in the preset directory.
 */
export interface PresetManifest {
  /** Preset display name */
  name: string;
  /** Version identifier */
  version: string;
  /** Short description of what this preset is for */
  description: string;
  /** Agents included in this preset */
  agents: PresetAgent[];
  /** Optional author attribution */
  author?: string;
  /** Optional tags for discovery */
  tags?: string[];
}

/**
 * Result of applying a single agent from a preset.
 */
export interface PresetApplyResult {
  agent: string;
  status: 'installed' | 'skipped' | 'error';
  reason?: string;
}
