import { pathToFileURL } from 'node:url';
import { main } from '../workflows/shared/check-agent-binding.mjs';

export * from '../workflows/shared/check-agent-binding.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Agent binding check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
