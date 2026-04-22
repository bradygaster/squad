/**
 * CLI module barrel exports.
 * @module cli
 */

export {
  type ReleaseChannel,
  type UpdateInfo as SDKUpdateInfo,
  type UpgradeOptions as SDKUpgradeOptions,
  checkForUpdate,
  performUpgrade
} from './upgrade.js';
export * from './copilot-install.js';
export * from './core/output.js';
export * from './core/errors.js';
export * from './core/detect-squad-dir.js';
export * from './core/gh-cli.js';
export { runWatch } from './commands/watch/index.js';
export * from './core/templates.js';
export {
  type UpgradeOptions,
  type UpdateInfo,
  runUpgrade
} from './core/upgrade.js';
export * from './core/migrations.js';
export * from './core/email-scrub.js';
export * from './core/migrate-directory.js';
export * from './core/init.js';
export * from './core/project-type.js';
export {
  getPackageVersion,
  readInstalledVersion
} from './core/version.js';
export * from './core/workflows.js';
export * from './core/team-md.js';
export { runCopilot, type CopilotFlags } from './commands/copilot.js';
export { runCost } from './commands/cost.js';
export { runDoctor, doctorCommand, type DoctorCheck, type DoctorMode } from './commands/doctor.js';
export { runExport } from './commands/export.js';
export { runImport } from './commands/import.js';
export { splitHistory } from './core/history-split.js';
export { discoverCommand, delegateCommand } from './commands/cross-squad.js';
