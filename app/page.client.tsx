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
import { loadSavedPositions } from "./lib/positions";
import { loadHiddenFiles, updateHiddenUI } from "./lib/hidden-files";
import { setupCanvasInteraction, setupEventListeners } from "./lib/events";
import { loadConnections } from "./lib/connections";
import {
  clearCanvas,
  updateCanvasTransform,
  updateZoomUI,
  restoreViewport,
} from "./lib/canvas";
import { setupPillInteraction } from "./lib/viewport-culling";
import { loadRepository } from "./lib/repo";
import { initLayers, renderLayersUI } from "./lib/layers";
import { setupAuth, updateFavoriteStar } from "./lib/user";
import { setupPerfOverlay } from "./lib/perf-overlay";
import { initGalaxyDrawState, initCardManager } from "./lib/xydraw-bridge";
import { initFilePreview, destroyFilePreview } from "./lib/file-preview";
import { hideLoadingProgress } from "./lib/loading";
import { initBranchCompare } from "./lib/branch-compare";
import { initCommandPalette } from "./lib/command-palette";
import { initShortcutsPanel } from "./lib/shortcuts-panel";
import { initStatusBar } from "./lib/status-bar";
import { initLayoutSnapshots } from "./lib/layout-snapshots";
// Tutorial removed — users learn by exploring
import { renderSyncControls } from "./lib/sync-controls";
import { renderVersionBadge } from "./lib/version";
import { renderRoleBadge } from "./lib/role";
import { renderRecentCommitsUI, addRecentRepo } from "./lib/recent-commits";

export default function mount(): () => void {
  // Stop any previous actor from a prior mount
  if ((window as any).__gitcanvas_cleanup__) {
    try {
      (window as any).__gitcanvas_cleanup__();
    } catch (_) {}
  }

  const actor = createActor(canvasMachine);
  const ctx = createCanvasContext(actor);
  let disposed = false;

  function showLandingPlaceholder() {
    document.body.classList.add("landing-placeholder-visible");
    ctx.actor.send({ type: "RESET_APP_STATE" });
    clearCanvas(ctx);
    ctx.fileCards.clear();
    ctx.deferredCards.clear();
    ctx.allFilesData = [];
    ctx.commitFilesData = [];
    ctx.changedFilePaths = new Set();
    ctx.snap().context.repoPath = "";

    const landing = document.getElementById("landingOverlay");
    if (landing) landing.style.display = "flex";

    const repoSelect = document.getElementById("repoSelect") as HTMLSelectElement;
    if (repoSelect) repoSelect.value = "";

    const fileCount = document.getElementById("fileCount");
    if (fileCount) fileCount.textContent = "0";

    const commitCount = document.getElementById("commitCount");
    if (commitCount) commitCount.textContent = "0";

    const commitInfo = document.getElementById("currentCommitInfo");
    if (commitInfo) {
      commitInfo.innerHTML = '<span class="commit-hash-label">No commit selected</span>';
    }

    const timeline = document.getElementById("timelineContainer");
    if (timeline) {
      timeline.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg><p>Load a repository</p></div>';
    }

    const changedFilesList = document.getElementById("changedFilesList");
    if (changedFilesList) changedFilesList.innerHTML = "";

    const changedFilesPanel = document.getElementById("changedFilesPanel");
    if (changedFilesPanel) changedFilesPanel.style.display = "none";

    const commitProgressBar = document.getElementById("commitProgressBar");
    if (commitProgressBar) commitProgressBar.style.display = "none";

    hideLoadingProgress(ctx);
    updateCanvasTransform(ctx);
    updateZoomUI(ctx);
    updateFavoriteStar("");
    updateStatusBarRepo("");
    updateStatusBarCommit("");
    updateStatusBarFiles(0);
    updateStatusBarSelected(0);
  }

  // ─── Init ────────────────────────────────────────────
  async function init() {
    return measure("app:init", async () => {
      ctx.canvas = document.getElementById("canvasContent");
      ctx.canvasViewport = document.getElementById("canvasViewport");

      // Reuse existing SVG overlay from server-rendered DOM
      ctx.svgOverlay = document.getElementById(
        "connectionsOverlay",
      ) as unknown as SVGSVGElement;
      if (!ctx.svgOverlay && ctx.canvas) {
        // Fallback: create overlay if not present
        ctx.svgOverlay = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        ) as SVGSVGElement;
        ctx.svgOverlay.id = "connectionsOverlay";
        ctx.svgOverlay.style.cssText =
          "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible;";
        ctx.canvas.appendChild(ctx.svgOverlay);
      }

      // Init xydraw state engine (binds to existing DOM)
      initGalaxyDrawState(ctx);

      // Init xydraw card manager (Phase 4 — registers file + diff plugins)
      initCardManager(ctx);

      actor.start();
      setupCanvasInteraction(ctx);
      setupEventListeners(ctx);
      setupPillInteraction(ctx);
      setupPerfOverlay(ctx);
      if (ctx.canvasViewport) initFilePreview(ctx.canvasViewport, ctx);
      initBranchCompare(ctx);
      initCommandPalette(ctx);
      initShortcutsPanel();
      initStatusBar(ctx);
      initLayoutSnapshots(ctx);
      await loadSavedPositions(ctx); // initial load (may be empty if no repo yet)
      if (disposed) return; // bail if cleaned up during await
      loadHiddenFiles(ctx);
      updateHiddenUI(ctx);
      loadConnections(ctx);
      if (disposed) return; // bail if cleaned up during await

      // Init auth UI
      setupAuth();

      // Render role badge
      renderRoleBadge();

      // Render sync controls (leader-only)
      renderSyncControls();
      renderVersionBadge();

      // Render recent commits
      renderRecentCommitsUI();

      // Store context globally for sync controls
      (window as any).__GITCANVAS_CTX__ = ctx;

      // Onboarding tutorial removed — users learn by doing

      // ── Shared Layout Decoder ──────────────────────────────────────────
      const applySharedLayout = async (ctx: CanvasContext) => {
        const urlParams = new URLSearchParams(window.location.search);
        const sharedLayout = urlParams.get("layout");
        if (!sharedLayout) return;

        try {
          const parsed = JSON.parse(atob(sharedLayout));
          if (parsed.positions) {
            ctx.positions = new Map(Object.entries(parsed.positions));
            const { savePosition } = await import("./lib/positions");
            // Quick dummy save to trigger debounced persistence
            savePosition(ctx, "_share_", "_trigger_", 0, 0);
          }
          if (parsed.hiddenFiles) {
            ctx.hiddenFiles = new Set(parsed.hiddenFiles);
            const { saveHiddenFiles } = await import("./lib/hidden-files");
            saveHiddenFiles(ctx);
            updateHiddenUI(ctx);
          }
          if (parsed.zoom !== undefined)
            ctx.actor.send({ type: "SET_ZOOM", zoom: parsed.zoom });
          if (parsed.offsetX !== undefined)
            ctx.actor.send({
              type: "SET_OFFSET",
              x: parsed.offsetX,
              y: parsed.offsetY,
            });
          if (parsed.cardSizes) {
            for (const [path, size] of Object.entries(parsed.cardSizes)) {
              ctx.actor.send({
                type: "RESIZE_CARD",
                path,
                width: (size as any).width,
                height: (size as any).height,
              });
            }
          }

          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("layout");
          window.history.replaceState({}, "", cleanUrl.toString());
          const { showToast } = await import("./lib/utils");
          showToast("Shared layout applied!", "success");
        } catch (e) {
          console.error("Failed to decode shared layout", e);
        }
      };

      // Check URL path for repo slug (e.g. /starwar or /galaxy-canvas/starwar)
      // Fallback: also check hash for legacy URLs (e.g. #starwar)
      const rawPath = decodeURIComponent(
        window.location.pathname.replace(/^\//, ""),
      );
      // Strip the route-name prefix if we're served at /galaxy-canvas
      const pathSlug = rawPath.replace(/^galaxy-canvas\/?/, "");
      const hashSlug = decodeURIComponent(
        window.location.hash.replace("#", ""),
      );
      const urlSlug = pathSlug || hashSlug;

      if (urlSlug) {
        // Migrate legacy hash URL to path URL
        if (hashSlug && !pathSlug) {
          history.replaceState(null, "", "/" + encodeURIComponent(hashSlug));
        }

        // Detect GitHub owner/repo pattern (exactly one /, no \ or : which indicate local paths)
        const isGitHubSlug =
          /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(urlSlug) &&
          !urlSlug.includes("\\") &&
          !urlSlug.includes(":");

        let resolvedPath: string;

        if (isGitHubSlug) {
          // Check if we already have a localStorage mapping for this GitHub slug
          const cached = localStorage.getItem(`gitcanvas:slug:${urlSlug}`);
          if (cached) {
            resolvedPath = cached;
          } else {
            // Clone from GitHub and use the local clone path
            const landing = document.getElementById("landingOverlay");
            if (landing) landing.style.display = "none";

            // Show loading state
            const loadingEl = document.getElementById("loadingProgress");
            if (loadingEl) {
              loadingEl.style.display = "flex";
              const msgEl = loadingEl.querySelector(".loading-message");
              if (msgEl)
                msgEl.textContent = `Cloning ${urlSlug} from GitHub...`;
            }

            try {
              const cloneRes = await fetch("/api/repo/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: `https://github.com/${urlSlug}.git`,
                }),
              });
              if (!cloneRes.ok) {
                const err = await cloneRes
                  .json()
                  .catch(() => ({ error: "Clone failed" }));
                throw new Error(err.error || "Clone failed");
              }
              const cloneData = await cloneRes.json();
              resolvedPath = cloneData.path;

              // Store slug→path mapping so future visits are instant
              localStorage.setItem(`gitcanvas:slug:${urlSlug}`, resolvedPath);
            } catch (err: any) {
              console.error(`[gitmaps] Failed to clone ${urlSlug}:`, err);
              const { showToast } = await import("./lib/utils");
              showToast(`Failed to clone ${urlSlug}: ${err.message}`, "error");
              // Fall through — show landing
              return;
            }
          }
        } else {
          // Resolve slug to full path (check localStorage mapping)
          resolvedPath =
            localStorage.getItem(`gitcanvas:slug:${urlSlug}`) || urlSlug;
        }

        // Hide landing immediately since we have a repo
        const landing = document.getElementById("landingOverlay");
        if (landing) landing.style.display = "none";

        const sel = document.getElementById("repoSelect") as HTMLSelectElement;
        if (sel) sel.value = resolvedPath;

        // Init layers based on repo
        ctx.actor.send({ type: "LOAD_REPO", path: resolvedPath });
        ctx.snap().context.repoPath = resolvedPath;
        await loadSavedPositions(ctx); // reload positions for this repo
        if (disposed) return;
        await applySharedLayout(ctx);
        initLayers(ctx);
        renderLayersUI(ctx);
        restoreViewport(ctx);
        updateCanvasTransform(ctx);
        updateZoomUI(ctx);

        if (!disposed) {
          loadRepository(ctx, resolvedPath);
          updateFavoriteStar(resolvedPath);
        }
      } else {
        // No URL slug — always show the landing placeholder page.
        // Never auto-load the previous repo on the root route.
        showLandingPlaceholder();
      }

      // Listen for popstate (back/forward navigation with path-based routing)
      window.addEventListener("popstate", () => {
        if (disposed) return;
        const slug = decodeURIComponent(
          window.location.pathname.replace(/^\//, ""),
        );

        if (!slug) {
          showLandingPlaceholder();
          return;
        }

        const resolvedPath =
          localStorage.getItem(`gitcanvas:slug:${slug}`) || slug;
        if (resolvedPath && resolvedPath !== ctx.snap().context.repoPath) {
          const sel3 = document.getElementById(
            "repoSelect",
          ) as HTMLSelectElement;
          if (sel3) sel3.value = resolvedPath;
          loadRepository(ctx, resolvedPath);
          updateFavoriteStar(resolvedPath);
        }
      });
    });
  }

  // ─── Boot ────────────────────────────────────────────
  init();

  // ─── Cleanup ─────────────────────────────────────────
  const cleanup = () => {
    disposed = true;
    (window as any).__gitcanvas_cleanup__ = null;
    try {
      actor.stop();
    } catch (_) {}
    if (ctx.canvasViewport) destroyFilePreview(ctx.canvasViewport);
    clearCanvas(ctx);
  };
  (window as any).__gitcanvas_cleanup__ = cleanup;
  return cleanup;
}
// Force cache bust Mon Mar 17 - removed onboarding + tutorial + lastRepo autoload
