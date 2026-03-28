// @ts-nocheck
/**
 * page.client.tsx — Slim orchestrator
 *
 * Creates the XState actor, initialises all sub-modules, and returns a
 * cleanup function. All heavy logic lives in `./lib/*` helpers.
 */
import { measure } from 'measure-fn';
import { createActor } from 'xstate';
import { canvasMachine } from './state/machine.js';
import { createCanvasContext } from './lib/context';
import { registerCanvasMount } from './lib/mount-lifecycle';
import { applySharedLayout } from './lib/shared-layout';
import { ensureSvgOverlay, initializeMountUi } from './lib/mount-init';
import { showLandingPlaceholder as showLandingReset } from './lib/landing-reset';
import { wireMountRoutes } from './lib/mount-route-wiring';
import { cleanupMount } from './lib/mount-cleanup';

export default function mount(): () => void {
  if ((window as any).__gitcanvas_cleanup__) {
    try {
      (window as any).__gitcanvas_cleanup__();
    } catch {}
  }

  const actor = createActor(canvasMachine);
  const ctx = createCanvasContext(actor);
  let disposed = false;

  function showLandingPlaceholder() {
    showLandingReset(ctx);
  }

  async function init() {
    return measure('app:init', async () => {
      ctx.canvas = document.getElementById('canvasContent');
      ctx.canvasViewport = document.getElementById('canvasViewport');

      ensureSvgOverlay(ctx);

      await initializeMountUi(ctx, actor, {
        isDisposed: () => disposed,
      });
      if (disposed) return;

      await wireMountRoutes(ctx, {
        isDisposed: () => disposed,
        showLandingPlaceholder,
        updateFavoriteStar: async (path: string) => {
          const mod = await import('./lib/user');
          mod.updateFavoriteStar(path);
        },
        applySharedLayout: () => applySharedLayout(ctx),
      });
    });
  }

  init();

  const cleanup = () => {
    void cleanupMount(ctx, actor, {
      markDisposed: () => {
        disposed = true;
      },
    });
  };

  registerCanvasMount(ctx, cleanup);
  return cleanup;
}
