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
  const pct = hasFileCount ? Math.round((loaded / total) * 100) : progress;

  return (
    <div className="loading-content">
      <div className="loading-spinner"></div>
      <div className="loading-message">{message}</div>
      <div className="loading-sub">{sub}</div>
      {pct !== undefined && (
        <div className="loading-progress-container">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${pct}%` }}
            ></div>
          </div>
          <div className="loading-progress-text">
            {hasFileCount ? `${loaded} / ${total}` : `${Math.round(pct)}%`}
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
