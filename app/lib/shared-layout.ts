import type { CanvasContext } from './context';
import { saveHiddenFiles, updateHiddenUI } from './hidden-files';
import { savePosition } from './positions';

export interface SharedLayoutPayload {
  positions?: Record<string, any>;
  hiddenFiles?: string[];
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  cardSizes?: Record<string, { width: number; height: number }>;
}

export function getSharedLayoutParam(search = window.location.search): string | null {
  return new URLSearchParams(search).get('layout');
}

export function clearSharedLayoutParam(url = window.location.href) {
  const cleanUrl = new URL(url);
  cleanUrl.searchParams.delete('layout');
  window.history.replaceState({}, '', cleanUrl.toString());
}

export function decodeSharedLayout(layout: string): SharedLayoutPayload {
  return JSON.parse(atob(layout));
}

export async function applySharedLayout(
  ctx: CanvasContext,
  options?: {
    search?: string;
    decode?: (layout: string) => SharedLayoutPayload;
    clearParam?: () => void;
    triggerPersist?: (ctx: CanvasContext) => void;
    showToast?: (message: string, type: string) => void | Promise<void>;
  },
) {
  const sharedLayout = getSharedLayoutParam(options?.search);
  if (!sharedLayout) return false;

  const decode = options?.decode || decodeSharedLayout;
  const clearParam = options?.clearParam || (() => clearSharedLayoutParam());
  const triggerPersist = options?.triggerPersist || ((ctx: CanvasContext) => {
    savePosition(ctx, '_share_', '_trigger_', 0, 0);
  });
  const showToast = options?.showToast || (async (message: string, type: string) => {
    const utils = await import('./utils');
    utils.showToast(message, type);
  });

  const parsed = decode(sharedLayout);

  if (parsed.positions) {
    ctx.positions = new Map(Object.entries(parsed.positions));
    triggerPersist(ctx);
  }
  if (parsed.hiddenFiles) {
    ctx.hiddenFiles = new Set(parsed.hiddenFiles);
    saveHiddenFiles(ctx);
    updateHiddenUI(ctx);
  }
  if (parsed.zoom !== undefined) {
    ctx.actor.send({ type: 'SET_ZOOM', zoom: parsed.zoom });
  }
  if (parsed.offsetX !== undefined) {
    ctx.actor.send({ type: 'SET_OFFSET', x: parsed.offsetX, y: parsed.offsetY });
  }
  if (parsed.cardSizes) {
    for (const [path, size] of Object.entries(parsed.cardSizes)) {
      ctx.actor.send({
        type: 'RESIZE_CARD',
        path,
        width: (size as any).width,
        height: (size as any).height,
      });
    }
  }

  clearParam();
  await showToast('Shared layout applied!', 'success');
  return true;
}
