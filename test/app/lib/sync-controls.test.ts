import { describe, expect, test } from 'bun:test';
import { clearRoleCache } from '../../../app/lib/role';
import { createSyncControlsUI } from '../../../app/lib/sync-controls';
import { setCanvasContext } from '../../../app/lib/context';
import { setupDomTest } from '../../../app/lib/test-dom';

describe('sync controls context source', () => {
  test('push button is wired when shared context exists and no window global is set', () => {
    const handle = setupDomTest({
      url: 'http://localhost:3335/',
      html: '<div class="toolbar-right"></div>',
    });

    try {
      clearRoleCache();
      const ctx = {
        snap: () => ({ context: { repoPath: 'C:/Code/gitmaps' } }),
        positions: new Map([['allfiles:src/index.ts', { x: 1, y: 2 }]]),
        allFilesData: [],
      } as any;

      setCanvasContext(ctx);
      (window as any).__GITCANVAS_CTX__ = null;

      const ui = createSyncControlsUI();
      document.body.appendChild(ui);

      const pushBtn = document.getElementById('pushBtn') as HTMLButtonElement;
      const pullBtn = document.getElementById('pullBtn') as HTMLButtonElement;

      expect(pushBtn).toBeTruthy();
      expect(pullBtn).toBeTruthy();
      expect(pushBtn.disabled).toBe(false);
      expect(pullBtn.disabled).toBe(false);
      expect(pushBtn.textContent).toContain('Push');
      expect(pullBtn.textContent).toContain('Pull');
    } finally {
      setCanvasContext(null);
      clearRoleCache();
      handle.cleanup();
    }
  });
});
