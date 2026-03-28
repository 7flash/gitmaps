import type { CanvasContext } from './context';
import { clearCanvas } from './canvas';
import { clearCanvasMount } from './mount-lifecycle';

export async function cleanupMount(
  ctx: CanvasContext,
  actor: { stop: () => void },
  options?: {
    markDisposed?: () => void;
    clearMount?: () => void;
    stopActor?: () => void;
    destroyPreview?: (viewport: HTMLElement) => void | Promise<void>;
    clearCanvasUi?: (ctx: CanvasContext) => void;
  },
) {
  const markDisposed = options?.markDisposed || (() => {});
  const clearMount = options?.clearMount || clearCanvasMount;
  const stopActor = options?.stopActor || (() => actor.stop());
  const destroyPreview = options?.destroyPreview || (async (viewport: HTMLElement) => {
    const mod = await import('./file-preview');
    mod.destroyFilePreview(viewport);
  });
  const clearCanvasUi = options?.clearCanvasUi || clearCanvas;

  markDisposed();
  clearMount();
  try {
    stopActor();
  } catch {}
  if (ctx.canvasViewport) {
    await destroyPreview(ctx.canvasViewport);
  }
  clearCanvasUi(ctx);
}
