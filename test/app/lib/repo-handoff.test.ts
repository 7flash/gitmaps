import { describe, expect, mock, test } from 'bun:test';
import { handoffRepoLoad } from '../../../app/lib/repo-handoff';
import { setupDomTest } from '../../../app/lib/test-dom';

describe('repo handoff helper', () => {
  test('uses onRepoReady seam and syncs repo selection without loading immediately', () => {
    const handle = setupDomTest({
      html: '<select id="repoSelect"><option value="">Select</option><option value="C:/Code/gitmaps">gitmaps</option></select>',
    });

    try {
      const onRepoReady = mock(() => undefined);
      const ctx = { onRepoReady } as any;

      handoffRepoLoad(ctx, 'C:/Code/gitmaps');

      expect((document.getElementById('repoSelect') as HTMLSelectElement).value).toBe('C:/Code/gitmaps');
      expect(onRepoReady).toHaveBeenCalledWith('C:/Code/gitmaps');
    } finally {
      handle.cleanup();
    }
  });
});
