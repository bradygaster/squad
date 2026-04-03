/**
 * Tests for scripts/check-squad-leakage.mjs
 *
 * Validates that the .squad/ leakage detector:
 * - Produces valid JSON with the correct schema { leaked, files }
 * - Reports no leakage when base ref equals HEAD (empty diff)
 * - Always exits with code 0 (informational only)
 * - Handles missing base ref gracefully
 */

import { describe, it, expect } from 'vitest';
import { extractJson, runScript } from './helpers';

describe('check-squad-leakage script', () => {
  describe('integration: no-diff baseline (HEAD as base ref)', () => {
    it('produces valid JSON with leaked and files fields', () => {
      const result = runScript('check-squad-leakage.mjs', ['HEAD']);
      const json = extractJson(result.stdout);

      expect(json).toHaveProperty('leaked');
      expect(typeof json.leaked).toBe('boolean');
      expect(json).toHaveProperty('files');
      expect(Array.isArray(json.files)).toBe(true);
    });

    it('reports no leakage when diff is empty (HEAD vs HEAD)', () => {
      const result = runScript('check-squad-leakage.mjs', ['HEAD']);
      const json = extractJson(result.stdout);

      expect(json.leaked).toBe(false);
      expect(json.files).toEqual([]);
    });

    it('includes success message when no leakage', () => {
      const result = runScript('check-squad-leakage.mjs', ['HEAD']);
      expect(result.stdout).toContain('No .squad/ file leakage detected');
    });

    it('always exits with code 0 (informational only)', () => {
      const result = runScript('check-squad-leakage.mjs', ['HEAD']);
      expect(result.status).toBe(0);
    });
  });

  describe('integration: default base ref', () => {
    it('exits with code 0 regardless of findings', () => {
      // Default base ref is origin/dev — may or may not exist
      const result = runScript('check-squad-leakage.mjs');
      expect(result.status).toBe(0);
    });

    it('always produces valid JSON output', () => {
      const result = runScript('check-squad-leakage.mjs');
      const json = extractJson(result.stdout);

      expect(json).toHaveProperty('leaked');
      expect(json).toHaveProperty('files');
      expect(typeof json.leaked).toBe('boolean');
      expect(Array.isArray(json.files)).toBe(true);
    });

    it('leaked files are strings when present', () => {
      const result = runScript('check-squad-leakage.mjs');
      const json = extractJson(result.stdout);
      const files = json.files as string[];

      for (const file of files) {
        expect(typeof file).toBe('string');
      }
    });

    it('all leaked files start with .squad/ prefix', () => {
      const result = runScript('check-squad-leakage.mjs');
      const json = extractJson(result.stdout);
      const files = json.files as string[];

      for (const file of files) {
        expect(file).toMatch(/^\.squad\//);
      }
    });
  });

  describe('edge case: invalid base ref', () => {
    it('handles a non-existent ref gracefully with no leakage', () => {
      const result = runScript('check-squad-leakage.mjs', [
        'refs/heads/this-branch-does-not-exist-ever-12345',
      ]);
      const json = extractJson(result.stdout);

      expect(json.leaked).toBe(false);
      expect(json.files).toEqual([]);
      expect(result.status).toBe(0);
    });
  });
});
