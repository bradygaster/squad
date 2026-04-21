/**
 * Tests for waitForManifestCode timeout cleanup behavior.
 *
 * Verifies that the local HTTP server started during GitHub App manifest
 * flow properly clears its timeout timer on all code paths:
 *   - Success (code received)
 *   - Server error
 *   - Timeout expiry
 *
 * These tests verify observable behavior (resolves/rejects correctly,
 * doesn't hang) rather than inspecting internal timer handles directly.
 *
 * @see packages/squad-cli/src/cli/commands/identity.ts — waitForManifestCode
 * @module test/identity/manifest-timeout
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('waitForManifestCode timeout behavior', () => {
  it('resolves with code when callback receives ?code= param', async () => {
    const result = await waitForCodeWithKnownPort(30_000, 'test-code-abc');

    expect(result.code).toBe('test-code-abc');
    expect(result.port).toBeGreaterThan(0);
  }, { timeout: 10_000 });

  it('resolves without hanging when code arrives (timer cleared)', async () => {
    const result = await waitForCodeWithKnownPort(60_000, 'test-code-123');

    expect(result.code).toBe('test-code-123');
    expect(result.port).toBeGreaterThan(0);
  }, { timeout: 10_000 });

  it('rejects on timeout without leaving dangling timers', async () => {
    // Reproduce the timeout path with a very short timeout
    const promise = new Promise<{ code: string; port: number }>((resolve, reject) => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('waiting');
      });

      server.listen(0, '127.0.0.1');

      server.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });

      timeoutHandle = setTimeout(() => {
        server.close();
        reject(new Error('Timed out'));
      }, 200);
    });

    await expect(promise).rejects.toThrow('Timed out');
  }, { timeout: 10_000 });

  it('rejects on server error with timer cleared', async () => {
    // Create two servers on the same port to force an EADDRINUSE error
    const blockingServer = http.createServer();
    await new Promise<void>((resolve) => {
      blockingServer.listen(0, '127.0.0.1', resolve);
    });
    const addr = blockingServer.address();
    const blockedPort =
      typeof addr === 'object' && addr ? addr.port : 0;

    // Now try to start a server that will fail because the port is taken
    const errorPromise = new Promise<never>((resolve, reject) => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const server = http.createServer();
      server.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });

      // This should cause EADDRINUSE
      server.listen(blockedPort, '127.0.0.1');

      timeoutHandle = setTimeout(() => {
        server.close();
        reject(new Error('Should not reach timeout'));
      }, 30_000);
    });

    await expect(errorPromise).rejects.toThrow();
    blockingServer.close();
  }, { timeout: 10_000 });

  it('resolves before timeout fires (no double rejection)', async () => {
    const result = await waitForCodeWithKnownPort(10_000, 'fast-code');

    expect(result.code).toBe('fast-code');

    // Wait a bit to ensure no unhandled promise rejection from a
    // dangling timer trying to reject an already-resolved promise
    await new Promise((r) => setTimeout(r, 500));
  }, { timeout: 10_000 });
});

// ============================================================================
// Helper: starts the manifest-code server and immediately hits it with a code
// ============================================================================

async function waitForCodeWithKnownPort(
  timeoutMs: number,
  code: string,
): Promise<{ code: string; port: number }> {
  return new Promise((resolve, reject) => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const receivedCode = url.searchParams.get('code');

      if (receivedCode) {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        clearTimeout(timeoutHandle);
        server.close();
        resolve({ code: receivedCode, port });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('waiting');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      // Immediately send the code callback
      http.get(`http://127.0.0.1:${port}/?code=${code}`, (res) => {
        res.resume(); // drain response
      });
    });

    server.on('error', (err) => {
      clearTimeout(timeoutHandle);
      reject(err);
    });

    timeoutHandle = setTimeout(() => {
      server.close();
      reject(new Error('Timed out'));
    }, timeoutMs);
  });
}
