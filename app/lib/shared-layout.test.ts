import { describe, expect, mock, test } from 'bun:test';
import { applySharedLayout, clearSharedLayoutParam, decodeSharedLayout, getSharedLayoutParam } from './shared-layout';
import { setupDomTest } from './test-dom';

describe('shared layout helper', () => {
  test('reads and clears the layout query param', () => {
    const handle = setupDomTest({ url: 'http://localhost:3335/gitmaps?layout=abc123&foo=bar' });
    try {
      expect(getSharedLayoutParam()).toBe('abc123');
      clearSharedLayoutParam();
      expect(window.location.search).toBe('?foo=bar');
    } finally {
      handle.cleanup();
    }
  });

  test('decodes base64 shared layout payloads', () => {
    const payload = { zoom: 1.5, hiddenFiles: ['a.ts'] };
    expect(decodeSharedLayout(btoa(JSON.stringify(payload)))).toEqual(payload);
  });

  test('applies shared layout state, clears the query param, and shows success toast', async () => {
    const layout = btoa(JSON.stringify({
      positions: { 'allfiles:src/index.ts': { x: 10, y: 20 } },
      hiddenFiles: ['secret.ts'],
      zoom: 1.25,
      offsetX: 111,
      offsetY: 222,
      cardSizes: { 'src/index.ts': { width: 600, height: 700 } },
    }));
    const handle = setupDomTest({
      url: `http://localhost:3335/gitmaps?layout=${encodeURIComponent(layout)}`,
      html: '<button id="showHidden" style="display:none"></button><span id="hiddenCount"></span>',
    });

    try {
      const sent: any[] = [];
      const toast = mock(async () => undefined);
      const clearParam = mock(() => clearSharedLayoutParam());
      const triggerPersist = mock(() => undefined);
      const ctx = {
        actor: { send: mock((event: any) => sent.push(event)) },
        positions: new Map(),
        hiddenFiles: new Set<string>(),
      } as any;

      const applied = await applySharedLayout(ctx, {
        clearParam,
        triggerPersist,
        showToast: toast,
      });

      expect(applied).toBe(true);
      expect(Array.from(ctx.positions.entries())).toEqual([
        ['allfiles:src/index.ts', { x: 10, y: 20 }],
      ]);
      expect(triggerPersist).toHaveBeenCalledWith(ctx);
      expect(Array.from(ctx.hiddenFiles)).toEqual(['secret.ts']);
      expect((document.getElementById('showHidden') as HTMLElement).style.display).toBe('inline-flex');
      expect(document.getElementById('hiddenCount')?.textContent).toBe('1');
      expect(sent).toContainEqual({ type: 'SET_ZOOM', zoom: 1.25 });
      expect(sent).toContainEqual({ type: 'SET_OFFSET', x: 111, y: 222 });
      expect(sent).toContainEqual({ type: 'RESIZE_CARD', path: 'src/index.ts', width: 600, height: 700 });
      expect(clearParam).toHaveBeenCalledTimes(1);
      expect(window.location.search).toBe('');
      expect(toast).toHaveBeenCalledWith('Shared layout applied!', 'success');
      expect(localStorage.getItem('gitcanvas:hiddenFiles')).toBe(JSON.stringify(['secret.ts']));
    } finally {
      handle.cleanup();
    }
  });

  test('is a no-op when no layout query param exists', async () => {
    const handle = setupDomTest({ url: 'http://localhost:3335/gitmaps' });
    try {
      const showToast = mock(async () => undefined);
      const applied = await applySharedLayout({ actor: { send: mock(() => undefined) }, positions: new Map(), hiddenFiles: new Set() } as any, {
        showToast,
      });
      expect(applied).toBe(false);
      expect(showToast).not.toHaveBeenCalled();
    } finally {
      handle.cleanup();
    }
  });
});
