import { describe, expect, test } from 'bun:test';
import { createCanvasContext, getCanvasContext, setCanvasContext } from './context';
import { setupDomTest } from './test-dom';

describe('shared canvas context lifecycle', () => {
  test('createCanvasContext registers the created context globally', () => {
    const handle = setupDomTest();
    try {
      const actor = { getSnapshot: () => ({ context: {} }) };
      const ctx = createCanvasContext(actor);
      expect(getCanvasContext()).toBe(ctx);
      expect(ctx.snap()).toEqual({ context: {} });
    } finally {
      setCanvasContext(null);
      handle.cleanup();
    }
  });

  test('setCanvasContext clears the shared context reference', () => {
    const handle = setupDomTest();
    try {
      const actor = { getSnapshot: () => ({ context: { repoPath: 'x' } }) };
      createCanvasContext(actor);
      expect(getCanvasContext()).not.toBeNull();
      setCanvasContext(null);
      expect(getCanvasContext()).toBeNull();
    } finally {
      setCanvasContext(null);
      handle.cleanup();
    }
  });
});
