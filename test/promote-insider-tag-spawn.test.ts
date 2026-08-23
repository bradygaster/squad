import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
}));

// @ts-expect-error - query keeps this mock-oriented import isolated from other tests
const { promoteInsiderTag } = await import('../scripts/promote-insider-tag.mjs?spawn-test');

describe('promoteInsiderTag npm command flow (Issue #1497)', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  it('verifies the target version exists before moving the insider dist-tag', () => {
    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '"0.13.0"\n', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '{"insider":"0.12.0"}\n', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });

    promoteInsiderTag('@bradygaster/squad-sdk', '0.13.0');

    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^npm(?:\.cmd)?$/),
      ['view', '@bradygaster/squad-sdk@0.13.0', 'version', '--json'],
      expect.any(Object),
    );
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/^npm(?:\.cmd)?$/),
      ['dist-tag', 'add', '@bradygaster/squad-sdk@0.13.0', 'insider'],
      expect.any(Object),
    );
  });

  it('does not promote an unpublished package version', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'E404 not found' });

    expect(() => promoteInsiderTag('@bradygaster/squad-cli', '0.13.0')).toThrow(
      /npm view failed for @bradygaster\/squad-cli@0\.13\.0/,
    );

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(spawnSyncMock.mock.calls[0][1]).toEqual([
      'view',
      '@bradygaster/squad-cli@0.13.0',
      'version',
      '--json',
    ]);
  });

  it('surfaces dist-tag add failures after the target version is verified', () => {
    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '"0.13.0"\n', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '{"insider":"0.12.0"}\n', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'permission denied' });

    expect(() => promoteInsiderTag('@bradygaster/squad-sdk', '0.13.0')).toThrow(
      /npm dist-tag add failed for @bradygaster\/squad-sdk@0\.13\.0/,
    );

    expect(spawnSyncMock).toHaveBeenCalledTimes(3);
  });
});
