// Explicit maintenance command: node test/helpers/refresh-squad-init-fixture.mjs
// Fetch only the approved immutable revision; verify GitHub's blob IDs before writing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const revision = '5c662ba015ec4f99befa51b0e8ca4f2148b0497f';
const files = {};
for (const path of ['.github/actions/squad-init/action.yml', 'scripts/install.sh']) {
  const remote = JSON.parse(execFileSync('gh', [
    'api', `repos/bradygaster/squad/contents/${path}?ref=${revision}`,
  ], { encoding: 'utf8' }));
  const bytes = Buffer.from(remote.content, 'base64');
  const blob = createHash('sha1')
    .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(blob, remote.sha, `GitHub blob mismatch: ${path}`);
  files[path] = {
    gitBlob: blob,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    content: bytes.toString('utf8'),
  };
}
writeFileSync('test/fixtures/squad-init-approved.json', `${JSON.stringify({
  repository: 'bradygaster/squad',
  revision,
  files,
}, null, 2)}\n`);
console.log(JSON.stringify({ revision, files: Object.fromEntries(
  Object.entries(files).map(([path, { gitBlob, sha256 }]) => [path, { gitBlob, sha256 }]),
) }, null, 2));
