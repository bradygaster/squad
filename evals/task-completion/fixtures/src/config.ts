export interface Config {
  name: string;
  version: string;
}

export function parseConfig(raw: string): Config {
  const lines = raw.split('\n');
  const lastLine = lines[lines.length - 1];
  return JSON.parse(lastLine);
}
