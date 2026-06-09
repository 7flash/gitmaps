// @ts-nocheck
/**
 * Main canvas UX fixes for local GitMaps use.
 *
 * This is intentionally defensive because some older builds still have canvas
 * panning listeners that run before card selection/listener code. We attach
 * capture-phase handlers to make the requested behavior deterministic:
 * - ?repo=C:\Code\game loads/syncs correctly
 * - selecting a repo updates the URL
 * - left-drag on empty canvas draws a marquee selection box
 * - Ctrl/Shift/Meta-click toggles multi-selection
 * - right-click on any card body/header/pill opens the card context menu
 * - dragging one selected card/pill moves the whole selection
 */
import type { CanvasContext } from './context';
import { getRepoPathFromLocation, normalizeRepoPath, syncRepoPathToUrl } from './repo-route';
import { syncRepoSelection, handoffRepoLoad } from './repo-handoff';

let installed = false;

function cardFromTarget(target: EventTarget | null): HTMLElement | null {
  const el = target as HTMLElement | null;
  return el?.closest?.('.file-card,.file-pill,[data-path]') as HTMLElement | null;
}

function pathFromCard(card: HTMLElement | null): string {
  return card?.dataset?.path || card?.getAttribute('data-path') || '';
}

function isInteractive(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('button,a,input,textarea,select,.line-num,.connect-btn,.diff-nav-btn,.file-pill-scroll-track,.file-card-body pre,.file-content-preview pre');
}

function selected(ctx: CanvasContext): string[] {
  return ctx.snap?.()?.context?.selectedCards || [];
}

function selectOne(ctx: CanvasContext, path: string, additive = false): void {
  if (!path) return;
  ctx.actor.send({ type: 'SELECT_CARD', path, shift: additive });
  refreshSelection(ctx);
}

function clearSelection(ctx: CanvasContext): void {
  ctx.actor.send({ type: 'DESELECT_ALL' });
  refreshSelection(ctx);
}

function refreshSelection(ctx: CanvasContext): void {
  try { require('./cards').updateSelectionHighlights(ctx); } catch { }
  try { require('./viewport-culling').updatePillSelectionHighlights(ctx); } catch { }
  try { require('./status-bar').updateStatusBarSelection?.(selected(ctx).length); } catch { }
}

function cardRect(card: HTMLElement): DOMRect {
  return card.getBoundingClientRect();
}

function intersects(a: DOMRect | { left: number; right: number; top: number; bottom: number }, b: DOMRect | { left: number; right: number; top: number; bottom: number }): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function makeSelectionBox(): HTMLElement {
  const box = document.createElement('div');
  box.className = 'gitmaps-marquee-selection';
  box.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;border:1px solid rgba(124,58,237,.95);background:rgba(124,58,237,.16);border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.08) inset;';
  document.body.appendChild(box);
  return box;
}

function updateBox(box: HTMLElement, x1: number, y1: number, x2: number, y2: number): DOMRect {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  return { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON() { return {}; } } as DOMRect;
}

function installUrlFixes(ctx: CanvasContext): void {
  const routed = getRepoPathFromLocation(window.location);
  if (routed) {
    const clean = normalizeRepoPath(routed);
    syncRepoSelection(clean);
    // Hydration usually handles the real load, but this makes query-path loading
    // work in builds where the route hydrator missed ?repo=.
    setTimeout(() => {
      const current = normalizeRepoPath(ctx.snap?.()?.context?.repoPath || '');
      if (!current && clean) handoffRepoLoad(ctx, clean);
      syncRepoPathToUrl(clean, true);
    }, 0);
  }

  const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement | null;
  if (repoSelect && !(repoSelect as any).__gitmapsUrlSync) {
    (repoSelect as any).__gitmapsUrlSync = true;
    repoSelect.addEventListener('change', () => {
      const value = normalizeRepoPath(repoSelect.value || '');
      if (value && !value.startsWith('__')) syncRepoPathToUrl(value);
    }, true);
  }
}

function installTimelineVisibility(): void {
  const style = document.createElement('style');
  style.dataset.gitmapsUxFixes = 'true';
  style.textContent = `
    #timelineContainer,#commitTimeline{display:flex!important;flex-direction:column!important;gap:6px!important;overflow:auto!important;max-height:calc(100vh - 210px)!important;min-height:120px!important;visibility:visible!important;opacity:1!important;}
    #timelineContainer button,.commit-item,.plain-timeline{display:block!important;width:100%!important;min-height:38px!important;cursor:pointer!important;}
    .file-card.is-selected,.file-pill.is-selected{outline:2px solid rgba(124,58,237,.95)!important;outline-offset:2px!important;}
  `;
  if (!document.querySelector('style[data-gitmaps-ux-fixes]')) document.head.appendChild(style);
}

function installRightClick(ctx: CanvasContext): void {
  const root = ctx.canvasViewport || ctx.canvas || document;
  root.addEventListener('contextmenu', (event: MouseEvent) => {
    const card = cardFromTarget(event.target);
    const path = pathFromCard(card);
    if (!card || !path) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (!selected(ctx).includes(path)) selectOne(ctx, path, false);
    try {
      require('./cards').showCardContextMenu(ctx, card, event.clientX, event.clientY);
    } catch (err) {
      console.warn('[gitmaps] context menu fallback failed', err);
    }
  }, true);
}

function installClickAndDrag(ctx: CanvasContext): void {
  const viewport = ctx.canvasViewport;
  if (!viewport || (viewport as any).__gitmapsUxClickDrag) return;
  (viewport as any).__gitmapsUxClickDrag = true;

  let mode: 'marquee' | 'drag-selected' | null = null;
  let startX = 0, startY = 0;
  let box: HTMLElement | null = null;
  let dragStarts: Array<{ path: string; card?: HTMLElement; pill?: HTMLElement; x: number; y: number }> = [];

  viewport.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button !== 0) return;
    const card = cardFromTarget(event.target);
    const path = pathFromCard(card);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;

    // Cards/pills: Ctrl/Shift/Meta-click toggles. Header/background drag moves selected group.
    if (card && path) {
      if (isInteractive(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if (additive || !selected(ctx).includes(path)) selectOne(ctx, path, additive);
      const targets = selected(ctx).includes(path) ? selected(ctx) : [path];
      dragStarts = targets.map(p => {
        const c = ctx.fileCards?.get(p) as HTMLElement | undefined;
        const deferred = ctx.deferredCards?.get(p);
        const pill = document.querySelector(`.file-pill[data-path="${CSS.escape(p)}"]`) as HTMLElement | null;
        const el = c || pill || null;
        return { path: p, card: c, pill: pill || undefined, x: deferred?.x ?? (el ? parseFloat(el.style.left) || 0 : 0), y: deferred?.y ?? (el ? parseFloat(el.style.top) || 0 : 0) };
      });
      startX = event.clientX; startY = event.clientY; mode = 'drag-selected';
      try { viewport.setPointerCapture(event.pointerId); } catch { }
      return;
    }

    // Empty canvas: left-drag selects, not pans. Space/middle mouse can still pan.
    if ((event as any).button === 1 || (ctx as any).spaceHeld) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    mode = 'marquee';
    startX = event.clientX; startY = event.clientY;
    box = makeSelectionBox();
    updateBox(box, startX, startY, startX, startY);
    try { viewport.setPointerCapture(event.pointerId); } catch { }
  }, true);

  viewport.addEventListener('pointermove', (event: PointerEvent) => {
    if (!mode) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (mode === 'marquee' && box) {
      updateBox(box, startX, startY, event.clientX, event.clientY);
      return;
    }

    if (mode === 'drag-selected') {
      const zoom = ctx.snap?.()?.context?.zoom || 1;
      const dx = (event.clientX - startX) / zoom;
      const dy = (event.clientY - startY) / zoom;
      for (const item of dragStarts) {
        const x = item.x + dx;
        const y = item.y + dy;
        if (item.card) { item.card.style.left = `${x}px`; item.card.style.top = `${y}px`; }
        if (item.pill) { item.pill.style.left = `${x}px`; item.pill.style.top = `${y}px`; }
        const deferred = ctx.deferredCards?.get(item.path);
        if (deferred) { deferred.x = x; deferred.y = y; }
      }
    }
  }, true);

  const finish = (event: PointerEvent) => {
    if (!mode) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    try { viewport.releasePointerCapture(event.pointerId); } catch { }

    if (mode === 'marquee' && box) {
      const rect = updateBox(box, startX, startY, event.clientX, event.clientY);
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (!additive) clearSelection(ctx);
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.file-card[data-path],.file-pill[data-path]'));
      const hits = cards.filter(card => intersects(rect, cardRect(card))).map(pathFromCard).filter(Boolean);
      hits.forEach((p, i) => selectOne(ctx, p, additive || i > 0));
      box.remove(); box = null;
    }

    if (mode === 'drag-selected') {
      try {
        const { savePosition } = require('./positions');
        const commitHash = ctx.snap?.()?.context?.currentCommitHash || 'allfiles';
        for (const item of dragStarts) {
          const el = item.card || item.pill;
          const deferred = ctx.deferredCards?.get(item.path);
          const x = deferred?.x ?? (el ? parseFloat(el.style.left) || 0 : item.x);
          const y = deferred?.y ?? (el ? parseFloat(el.style.top) || 0 : item.y);
          savePosition(ctx, commitHash, item.path, x, y);
        }
      } catch { }
      try { require('./canvas').forceMinimapRebuild(ctx); } catch { }
    }

    dragStarts = [];
    mode = null;
  };

  viewport.addEventListener('pointerup', finish, true);
  viewport.addEventListener('pointercancel', finish, true);
}

export function installMainCanvasUxFixes(ctx: CanvasContext): void {
  if (installed) return;
  installed = true;
  try { localStorage.setItem('gitcanvas:controlMode', 'advanced'); } catch { }
  try { (ctx as any).controlMode = 'advanced'; } catch { }
  installTimelineVisibility();
  installUrlFixes(ctx);
  installRightClick(ctx);
  installClickAndDrag(ctx);
}
