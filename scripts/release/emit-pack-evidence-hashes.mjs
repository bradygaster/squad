#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const evidence = JSON.parse(readFileSync(path.join(process.env.EVIDENCE_DIR, 'pack-evidence.json'), 'utf8'));
appendFileSync(
  process.env.GITHUB_OUTPUT,
  `sdk_sha256=${evidence.packages['@bradygaster/squad-sdk'].sha256}\ncli_sha256=${evidence.packages['@bradygaster/squad-cli'].sha256}\n`,
);
