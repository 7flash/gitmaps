// @ts-nocheck
/**
 * Loading progress overlay.
 * Uses melina/client JSX + render.
 */
import { render } from "melina/client";
import type { CanvasContext } from "./context";

function LoadingOverlayContent({
  message,
  sub,
  progress,
  loaded,
  total,
}: {
  message: string;
  sub: string;
  progress?: number;
  loaded?: number;
  total?: number;
}) {
  const hasFileCount = loaded !== undefined && total !== undefined && total > 0;
  const safeLoaded = hasFileCount ? Math.min(loaded ?? 0, total ?? 0) : undefined;
  const remaining = hasFileCount ? Math.max((total ?? 0) - (safeLoaded ?? 0), 0) : undefined;
  const pct = hasFileCount ? Math.round(((safeLoaded ?? 0) / (total ?? 1)) * 100) : progress;

  return (
    <div className="loading-content">
      <div className="loading-spinner"></div>
      <div className="loading-message">{message}</div>
      <div className="loading-sub">{sub}</div>
      {hasFileCount && (
        <div className="loading-stats">
          <div className="loading-stat">
            <span className="loading-stat-label">Total</span>
            <span className="loading-stat-value">{total}</span>
          </div>
          <div className="loading-stat">
            <span className="loading-stat-label">Loaded</span>
            <span className="loading-stat-value">{safeLoaded}</span>
          </div>
          <div className="loading-stat">
            <span className="loading-stat-label">Remaining</span>
            <span className="loading-stat-value">{remaining}</span>
          </div>
        </div>
      )}
      {pct !== undefined && (
        <div className="loading-progress-container">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${pct}%` }}
            ></div>
          </div>
          <div className="loading-progress-text">
            {hasFileCount
              ? `${pct}% • ${remaining} remaining`
              : `${Math.round(pct)}%`}
          </div>
        </div>
      )}
    </div>
  );
}

let currentMessage = "";
let currentSub = "";
let currentProgress: number | undefined;
let currentLoaded: number | undefined;
let currentTotal: number | undefined;

function rerender(ctx: CanvasContext) {
  if (!ctx.loadingOverlay) return;
  render(
    <LoadingOverlayContent
      message={currentMessage}
      sub={currentSub}
      progress={currentProgress}
      loaded={currentLoaded}
      total={currentTotal}
    />,
    ctx.loadingOverlay,
  );
}

export function showLoadingProgress(
  ctx: CanvasContext,
  message: string,
  progress?: number,
) {
  if (!ctx.loadingOverlay) {
    ctx.loadingOverlay = document.createElement("div");
    ctx.loadingOverlay.className = "loading-overlay";
    document.body.appendChild(ctx.loadingOverlay);
  }
  currentMessage = message;
  currentSub = "";
  currentProgress = progress;
  currentLoaded = undefined;
  currentTotal = undefined;
  rerender(ctx);
  ctx.loadingOverlay.classList.add("active");
}

export function updateLoadingProgress(
  ctx: CanvasContext,
  sub: string,
  progress?: number,
) {
  if (ctx.loadingOverlay) {
    currentSub = sub;
    if (progress !== undefined) currentProgress = progress;
    rerender(ctx);
  }
}

export function updateLoadingFileCount(
  ctx: CanvasContext,
  loaded: number,
  total: number,
  sub?: string,
) {
  if (ctx.loadingOverlay) {
    currentLoaded = loaded;
    currentTotal = total;
    if (sub !== undefined) currentSub = sub;
    rerender(ctx);
  }
}

export function hideLoadingProgress(ctx: CanvasContext) {
  if (ctx.loadingOverlay) {
    ctx.loadingOverlay.classList.remove("active");
  }
}
