/**
 * Project type detection — zero dependencies
 */

import fs from 'node:fs';
import path from 'node:path';

export type ProjectType = 'npm' | 'go' | 'python' | 'java' | 'dotnet' | 'unknown';

/**
 * Detect project type by checking for marker files in the target directory
 */
export function detectProjectType(dir: string): ProjectType {
  if (fs.existsSync(path.join(dir, 'package.json'))) return 'npm';
  if (fs.existsSync(path.join(dir, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(dir, 'requirements.txt')) ||
      fs.existsSync(path.join(dir, 'pyproject.toml'))) return 'python';
  if (fs.existsSync(path.join(dir, 'pom.xml')) ||
      fs.existsSync(path.join(dir, 'build.gradle')) ||
      fs.existsSync(path.join(dir, 'build.gradle.kts'))) return 'java';
  try {
    const entries = fs.readdirSync(dir);
    if (entries.some((e: string) => e.endsWith('.csproj') || e.endsWith('.sln') || e.endsWith('.slnx') || e.endsWith('.fsproj') || e.endsWith('.vbproj'))) return 'dotnet';
  } catch {}
  return 'unknown';
}
