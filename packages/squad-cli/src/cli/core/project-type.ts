/**
 * Project type detection — zero dependencies
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

export type ProjectType = 'npm' | 'go' | 'python' | 'java' | 'dotnet' | 'unknown';

/**
 * Detect project type by checking for marker files in the target directory
 */
export function detectProjectType(dir: string): ProjectType {
  if (storage.existsSync(path.join(dir, 'package.json'))) return 'npm';
  if (storage.existsSync(path.join(dir, 'go.mod'))) return 'go';
  if (storage.existsSync(path.join(dir, 'requirements.txt')) ||
      storage.existsSync(path.join(dir, 'pyproject.toml'))) return 'python';
  if (storage.existsSync(path.join(dir, 'pom.xml')) ||
      storage.existsSync(path.join(dir, 'build.gradle')) ||
      storage.existsSync(path.join(dir, 'build.gradle.kts'))) return 'java';
  try {
    const entries = storage.listSync(dir);
    if (entries.some(e => e.endsWith('.csproj') || e.endsWith('.sln') || e.endsWith('.slnx') || e.endsWith('.fsproj') || e.endsWith('.vbproj'))) return 'dotnet';
  } catch {}
  return 'unknown';
}
