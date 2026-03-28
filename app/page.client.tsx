// @ts-nocheck
/**
 * page.client.tsx — Slim orchestrator
 *
 * Creates the XState actor, initialises all sub-modules, and returns a
 * cleanup function.  All heavy logic lives in `./lib/*`.
 *
 * Uses an AbortController to cancel in-flight async work when cleanup runs,
 * preventing the "stopped actor" race condition.
 */
import { measure } from "measure-fn";
import { createActor } from "xstate";
import { canvasMachine } from "./state/machine.js";
import { createCanvasContext } from "./lib/context";
import { clearCanvasMount, registerCanvasMount } from "./lib/mount-lifecycle";
import { loadSavedPositions } from "./lib/positions";
import { applySharedLayout } from "./lib/shared-layout";
import { ensureSvgOverlay, initializeMountUi } from "./lib/mount-init";
import {
  clearCanvas,
  updateCanvasTransform,
  updateZoomUI,
} from "./lib/canvas";
import { setupPillInteraction } from "./lib/viewport-culling";
import {
  bootstrapInitialRouteUi,
  handleInitialRouteError,
  hideInitialRouteLanding,
  hydrateInitialRouteRepo,
  migrateLegacyHashRoute,
  resolveInitialRepoPath,
  showInitialRouteCloneStart,
} from "./lib/initial-route-hydration";
import { handlePopstateRepoEntry } from "./lib/route-repo-entry";
import { showLandingPlaceholder as showLandingReset } from "./lib/landing-reset";
import { setupAuth, updateFavoriteStar } from "./lib/user";
import { setupPerfOverlay } from "./lib/perf-overlay";
import { initGalaxyDrawState, initCardManager } from "./lib/xydraw-bridge";
import { initFilePreview, destroyFilePreview } from "./lib/file-preview";
import { initBranchCompare } from "./lib/branch-compare";
import { initCommandPalette } from "./lib/command-palette";
import { initShortcutsPanel } from "./lib/shortcuts-panel";
import { initStatusBar } from "./lib/status-bar";
import { initLayoutSnapshots } from "./lib/layout-snapshots";
import { renderSyncControls } from "./lib/sync-controls";
import { renderVersionBadge } from "./lib/version";
import { renderRoleBadge } from "./lib/role";
import { renderRecentCommitsUI } from "./lib/recent-commits";

export default function mount(): () => void {
  if ((window as any).__gitcanvas_cleanup__) {
    try {
      (window as any).__gitcanvas_cleanup__();
    } catch (_) {}
  }

  const actor = createActor(canvasMachine);
  const ctx = createCanvasContext(actor);
  let disposed = false;

  function showLandingPlaceholder() {
    showLandingReset(ctx);
  }

  async function init() {
    return measure("app:init", async () => {
      ctx.canvas = document.getElementById("canvasContent");
      ctx.canvasViewport = document.getElementById("canvasViewport");

      ensureSvgOverlay(ctx);

      await initializeMountUi(ctx, actor, {
        isDisposed: () => disposed,
      });
      if (disposed) return;

      await hydrateInitialRouteRepo(ctx, {
        disposed,
        showLandingPlaceholder,
        hideLanding: hideInitialRouteLanding,
        migrateLegacyHashRoute,
        resolveRepoPath: async (slug) => {
          try {
            return await resolveInitialRepoPath(slug, {
              onCloneStart: showInitialRouteCloneStart,
            });
          } catch (err: any) {
            return await handleInitialRouteError(err);
          }
        },
        bootstrapRepoUi: async (resolvedPath) => {
          await bootstrapInitialRouteUi(ctx, resolvedPath, {
            disposed,
            applySharedLayout: () => applySharedLayout(ctx),
          });
        },
        updateFavoriteStar,
      });

      window.addEventListener("popstate", () => {
        handlePopstateRepoEntry(ctx, {
          disposed,
          currentRepoPath: ctx.snap().context.repoPath,
          showLandingPlaceholder,
          updateFavoriteStar,
        });
      });
    });
  }

  init();

  const cleanup = () => {
    disposed = true;
    clearCanvasMount();
    try {
      actor.stop();
    } catch (_) {}
    if (ctx.canvasViewport) destroyFilePreview(ctx.canvasViewport);
    clearCanvas(ctx);
  };
  registerCanvasMount(ctx, cleanup);
  return cleanup;
}
// Force cache bust Mon Mar 17 - removed onboarding + tutorial + lastRepo autoload
 Mon Mar 17 - removed onboarding + tutorial + lastRepo autoload
