#!/usr/bin/env node
import { compileWithPinnedActions } from '../../.github/workflows/shared/squad-install-verifier.mjs';

compileWithPinnedActions(process.cwd());
