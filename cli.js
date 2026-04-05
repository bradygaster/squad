#!/usr/bin/env node

// Show deprecation only when invoked via npx/npm (not `node cli.js`)
if (process.env.npm_execpath) {
  console.error('\x1b[33m');
  console.error('⚠  DEPRECATION NOTICE');
  console.error('   npx github:bradygaster/squad is deprecated.');
  console.error('   Switch to: npm install -g @bradygaster/squad-cli@latest');
  console.error('   Then run:  squad');
  console.error('\x1b[0m');
}

// Forward to the built CLI entry point (auto-executes main())
import './packages/squad-cli/dist/cli-entry.js';