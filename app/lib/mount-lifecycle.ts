import { setCanvasContext } from './context';
import type { CanvasContext } from './context';

export function registerCanvasMount(ctx: CanvasContext, cleanup: () => void): void {
  setCanvasContext(ctx);
  (window as any).__gitcanvas_cleanup__ = cleanup;
}

export function clearCanvasMount(): void {
  (window as any).__gitcanvas_cleanup__ = null;
  setCanvasContext(null);
}