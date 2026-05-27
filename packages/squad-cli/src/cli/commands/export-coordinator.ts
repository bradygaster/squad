/**
 * Export coordinator command — generates .github/agents/squad.md
 * from .squad/ state using the repo-native prompt compiler.
 */

import path from 'node:path';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { success, warn } from '../core/output.js';
import { fatal } from '../core/errors.js';

import type { CoordinatorExportOptions } from '@bradygaster/squad-sdk';

/**
 * Parse CLI args into coordinator export options.
 */
export function parseCoordinatorOptions(args: string[]): CoordinatorExportOptions {
  const options: CoordinatorExportOptions = {
    outPath: '.github/agents/squad.md',
    skills: 'baseline',
    check: false,
    watch: false,
    dryRun: false,
    force: false,
    cleanLegacyAgent: false,
    maxPromptTokens: 14_000,
    compact: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--out':
        options.outPath = args[++i] || options.outPath;
        break;
      case '--model':
        options.model = args[++i];
        break;
      case '--description':
        options.description = args[++i];
        break;
      case '--skills':
        const skillsVal = args[++i];
        if (skillsVal === 'baseline' || skillsVal === 'all' || skillsVal === 'none') {
          options.skills = skillsVal;
        } else if (skillsVal) {
          options.skills = skillsVal.split(',').map(s => s.trim());
        }
        break;
      case '--check':
        options.check = true;
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--clean-legacy-agent':
        options.cleanLegacyAgent = true;
        break;
      case '--max-prompt-tokens':
        options.maxPromptTokens = parseInt(args[++i] ?? '', 10) || 14_000;
        break;
      case '--compact':
        options.compact = true;
        break;
    }
  }

  return options;
}

/**
 * Run the coordinator agent export.
 */
export async function runCoordinatorExport(dest: string, args: string[]): Promise<void> {
  const options = parseCoordinatorOptions(args);
  const squadInfo = detectSquadDir(dest);

  const teamMdPath = path.join(squadInfo.path, 'team.md');
  const { existsSync } = await import('node:fs');
  if (!existsSync(teamMdPath)) {
    fatal('No squad found — run init first');
  }

  // Lazy import to avoid loading the SDK modules until needed
  const { loadExportContext, compileCoordinatorPrompt, renderFrontmatter, writeCoordinatorAgent, startWatchExport } =
    await import('@bradygaster/squad-sdk/repo-native');

  const doExport = async () => {
    const context = await loadExportContext(dest, squadInfo.path, {
      outputPath: options.outPath,
      generatedAt: new Date().toISOString(),
      modelOverride: options.model,
      descriptionOverride: options.description,
      skillMode: options.skills,
    });

    const prompt = compileCoordinatorPrompt(context, {
      softLimit: options.maxPromptTokens,
      hardLimit: 20_000,
      compact: options.compact,
    });

    const frontmatter = renderFrontmatter(context.coordinator);
    const output = `${frontmatter}\n\n${prompt.markdown}\n`;

    const result = writeCoordinatorAgent({
      root: dest,
      outputPath: options.outPath,
      output,
      check: options.check,
      dryRun: options.dryRun,
      force: options.force,
      cleanLegacyAgent: options.cleanLegacyAgent,
    });

    return { result, prompt };
  };

  // Handle check mode
  if (options.check) {
    const { result } = await doExport();
    if (result.driftDetected) {
      fatal('Coordinator export drift detected. Run: squad export agent');
    }
    success('Coordinator export is up to date');
    return;
  }

  // Handle watch mode
  if (options.watch) {
    // Do initial export
    const { result, prompt } = await doExport();
    if (result.written) {
      const displayPath = path.relative(dest, result.outputPath) || path.basename(result.outputPath);
      success(`Exported coordinator to ${displayPath} (~${prompt.estimatedTokens} tokens, mode: ${prompt.mode})`);
    }

    console.log('Watching .squad/ for changes... (Ctrl+C to stop)');
    startWatchExport({
      root: dest,
      squadRoot: squadInfo.path,
      onRebuild: async () => {
        try {
          const { result: r, prompt: p } = await doExport();
          if (r.written) {
            const ts = new Date().toLocaleTimeString();
            success(`[${ts}] Re-exported (~${p.estimatedTokens} tokens, mode: ${p.mode})`);
          }
        } catch (err) {
          console.error(`Rebuild failed: ${(err as Error).message}`);
        }
      },
    });

    // Keep process alive
    await new Promise(() => {});
    return;
  }

  // Standard export
  try {
    const { result, prompt } = await doExport();

    if (result.legacyCollision && !result.legacyCleaned) {
      warn('Legacy squad.agent.md detected. Use --clean-legacy-agent to remove it.');
    }
    if (result.legacyCleaned) {
      success('Renamed legacy squad.agent.md to squad.agent.md.bak');
    }

    if (result.written) {
      const displayPath = path.relative(dest, result.outputPath) || path.basename(result.outputPath);
      success(`Exported coordinator to ${displayPath}`);
      console.log(`  Tokens: ~${prompt.estimatedTokens} (mode: ${prompt.mode})`);
      if (prompt.appliedCompactions.length > 0) {
        console.log(`  Compactions: ${prompt.appliedCompactions.join(', ')}`);
      }
    }
  } catch (err) {
    fatal((err as Error).message);
  }
}
