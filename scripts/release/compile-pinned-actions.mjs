#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const verifierUrl = pathToFileURL(
  path.resolve(process.cwd(), '.github/workflows/shared/squad-install-verifier.mjs'),
).href;
const { compileWithPinnedActions } = await import(verifierUrl);
compileWithPinnedActions(process.cwd());
