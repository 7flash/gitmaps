import { describe, expect, test } from 'bun:test';
import { getCanvasContext } from './context';
import { clearCanvasMount, registerCanvasMount } from './mount-lifecycle';
import { setupDomTest } from './test-dom';

describe('mount lifecycle helper', () => {
  test('registerCanvasMount stores cleanup and shared context together', () => {
    const handle = setupDomTest();
    try {
      const ctx = { snap: () => ({ context: {} }) } as any;
      const cleanup = () => {};

      registerCanvasMount(ctx, cleanup);

      expect(getCanvasContext()).toBe(ctx);
      expect((window as any).__gitcanvas_cleanup__).toBe(cleanup);
    } finally {
      clearCanvasMount();
      handle.cleanup();
    }
  });

  test('clearCanvasMount clears both cleanup and shared context', () => {
    const handle = setupDomTest();
    try {
      registerCanvasMount({ snap: () => ({ context: {} }) } as any, () => {});
      expect(getCanvasContext()).not.toBeNull();
      expect((window as any).__gitcanvas_cleanup__).toBeTruthy();

      clearCanvasMount();

      expect(getCanvasContext()).toBeNull();
      expect((window as any).__gitcanvas_cleanup__).toBeNull();
    } finally {
      clearCanvasMount();
      handle.cleanup();
    }
  });
});
