import { describe, expect, mock, test } from 'bun:test';
import { cleanupMount } from './mount-cleanup';
import { setupDomTest } from './test-dom';

describe('mount cleanup helper', () => {
  test('runs cleanup steps in order and tears down preview when viewport exists', async () => {
    const handle = setupDomTest({ html: '<div id="viewport"></div>' });
    try {
      const calls: string[] = [];
      const viewport = document.getElementById('viewport') as HTMLElement;
      const ctx = { canvasViewport: viewport } as any;
      const actor = { stop: mock(() => { calls.push('stopActor'); }) };

      await cleanupMount(ctx, actor, {
        markDisposed: () => { calls.push('markDisposed'); },
        clearMount: () => { calls.push('clearMount'); },
        stopActor: () => { calls.push('stopActor'); },
        destroyPreview: (el) => { calls.push(`destroyPreview:${el.id}`); },
        clearCanvasUi: () => { calls.push('clearCanvas'); },
      });

      expect(calls).toEqual([
        'markDisposed',
        'clearMount',
        'stopActor',
        'destroyPreview:viewport',
        'clearCanvas',
      ]);
    } finally {
      handle.cleanup();
    }
  });

  test('continues cleanup when actor stop throws and skips preview teardown without viewport', async () => {
    const handle = setupDomTest();
    try {
      const destroyPreview = mock(() => undefined);
      const clearCanvasUi = mock(() => undefined);

      cleanupMount({ canvasViewport: null } as any, { stop: mock(() => { throw new Error('boom'); }) }, {
        stopActor: () => { throw new Error('boom'); },
        destroyPreview,
        clearCanvasUi,
      });

      expect(destroyPreview).not.toHaveBeenCalled();
      expect(clearCanvasUi).toHaveBeenCalledTimes(1);
    } finally {
      handle.cleanup();
    }
  });
});
