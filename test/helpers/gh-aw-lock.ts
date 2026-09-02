/**
 * Shared helper for extracting the JSON-encoded safe-outputs config from a
 * compiled gh-aw `.lock.yml` file.
 *
 * gh-aw v0.86.x wrote this config as a bash heredoc redirected to
 * `safeoutputs/config.json` (`cat <<'EOF' > .../config.json ... EOF`). gh-aw
 * v0.87.x (required for #1955's `add-labels`/`create-if-missing` support)
 * instead emits it as a single-line, JSON-escaped YAML env var
 * (`GH_AW_SAFE_OUTPUTS_CONFIG: "{\"key\":...}"`). This helper supports both
 * shapes so tests track the compiler's actual output rather than one
 * specific serialization strategy, and keep working across future
 * gh-aw version bumps that may reintroduce either style.
 */
export function extractSafeOutputsConfigJson(compiledLockYml: string): string | undefined {
  const lines = compiledLockYml.split(/\r?\n/);

  const envVarLine = lines.find(line => line.includes('GH_AW_SAFE_OUTPUTS_CONFIG:'));
  if (envVarLine) {
    const match = envVarLine.match(/GH_AW_SAFE_OUTPUTS_CONFIG:\s*"(.*)"\s*$/);
    if (match) return match[1].replace(/\\"/g, '"');
  }

  const configStart = lines.findIndex(
    line => line.includes('/safeoutputs/config.json') && line.includes('<<'),
  );
  if (configStart === -1) return undefined;
  const delimiter = lines[configStart]?.match(/<< '([^']+)'/)?.[1];
  if (!delimiter) return undefined;
  const configEnd = lines.findIndex(
    (line, index) => index > configStart && line.trim() === delimiter,
  );
  if (configEnd <= configStart) return undefined;
  return lines.slice(configStart + 1, configEnd).join('\n');
}
