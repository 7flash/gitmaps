import { savePositions } from './state';
import type { CanvasRefs, CanvasState } from './types';
import { addListener, clamp } from './utils';
import type { CardRenderer } from './cards';

const WIDTH = 450, HEIGHT = 360, GAP = 22;

export class ViewportController {
  private disposers: Array<() => void> = [];
  private space = false;
  constructor(private readonly state: CanvasState, private readonly refs: CanvasRefs, private readonly cards: CardRenderer, private readonly clearSelection: () => void) {}

  mount(): void {
    let pointer: number | null = null, startClientX = 0, startClientY = 0, startX = 0, startY = 0;
    addListener(this.disposers, window, 'keydown', ((event: KeyboardEvent) => { if (event.code === 'Space') this.space = true; if (event.key === 'Escape') this.clearSelection(); }) as EventListener);
    addListener(this.disposers, window, 'keyup', ((event: KeyboardEvent) => { if (event.code === 'Space') this.space = false; }) as EventListener);
    addListener(this.disposers, this.refs.viewport, 'pointerdown', ((event: PointerEvent) => {
      const onCard = Boolean((event.target as HTMLElement).closest('.plain-card'));
      if (onCard && !this.space && event.button !== 1) return;
      pointer = event.pointerId; startClientX = event.clientX; startClientY = event.clientY; startX = this.state.transform.x; startY = this.state.transform.y;
      this.refs.viewport.setPointerCapture(pointer);
    }) as EventListener);
    addListener(this.disposers, this.refs.viewport, 'pointermove', ((event: PointerEvent) => { if (pointer !== event.pointerId) return; this.state.transform.x = startX + event.clientX - startClientX; this.state.transform.y = startY + event.clientY - startClientY; this.apply(); }) as EventListener);
    const stop = (event: PointerEvent) => { if (pointer !== event.pointerId) return; try { this.refs.viewport.releasePointerCapture(pointer); } catch {} pointer = null; };
    addListener(this.disposers, this.refs.viewport, 'pointerup', stop as EventListener);
    addListener(this.disposers, this.refs.viewport, 'pointercancel', stop as EventListener);
    addListener(this.disposers, this.refs.viewport, 'wheel', ((event: WheelEvent) => {
      const inFileScroll = Boolean((event.target as HTMLElement).closest('.plain-card__body'));
      if (inFileScroll && !event.ctrlKey && !event.metaKey) return;
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); this.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1);
    }) as EventListener, { passive: false });
    addListener(this.disposers, document.getElementById('fitAll'), 'click', (() => this.fit()) as EventListener);
    addListener(this.disposers, document.getElementById('stickyFitAll'), 'click', (() => this.fit()) as EventListener);
    addListener(this.disposers, document.getElementById('resetView'), 'click', (() => this.reset()) as EventListener);
    addListener(this.disposers, document.getElementById('arrangeRow'), 'click', (() => this.arrange(Array.from(this.state.selected), 'row')) as EventListener);
    addListener(this.disposers, document.getElementById('arrangeGrid'), 'click', (() => this.arrange(Array.from(this.state.selected), 'grid')) as EventListener);
    this.apply();
  }
  dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }
  reset(): void { this.state.transform = { x: 36, y: 30, zoom: 1 }; this.apply(); }
  fit(): void {
    const positions = this.cards.visiblePositions(); if (!positions.length) return this.reset();
    const minX = Math.min(...positions.map(p => p.x)), minY = Math.min(...positions.map(p => p.y));
    const maxX = Math.max(...positions.map(p => p.x + p.width)), maxY = Math.max(...positions.map(p => p.y + p.height));
    const margin = 38;
    const zoom = clamp(Math.min((this.refs.viewport.clientWidth - margin * 2) / Math.max(maxX - minX, 1), (this.refs.viewport.clientHeight - margin * 2) / Math.max(maxY - minY, 1)), 0.14, 1);
    this.state.transform = { zoom, x: margin - minX * zoom, y: margin - minY * zoom }; this.apply();
  }
  arrange(paths: string[], mode: 'row' | 'grid'): void {
    const targets = paths.length ? paths : Array.from(this.state.cards.keys());
    const columns = mode === 'row' ? targets.length : Math.max(1, Math.ceil(Math.sqrt(targets.length)));
    targets.forEach((path, index) => {
      const position = this.state.positions.get(path), card = this.state.cards.get(path); if (!position || !card) return;
      position.x = (index % columns) * (WIDTH + GAP); position.y = Math.floor(index / columns) * (HEIGHT + GAP);
      card.style.left = `${position.x}px`; card.style.top = `${position.y}px`;
    });
    savePositions(this.state); this.fit();
  }
  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.refs.viewport.getBoundingClientRect(); const x = clientX - rect.left, y = clientY - rect.top; const oldZoom = this.state.transform.zoom; const zoom = clamp(oldZoom * factor, 0.12, 3);
    const worldX = (x - this.state.transform.x) / oldZoom, worldY = (y - this.state.transform.y) / oldZoom;
    this.state.transform = { zoom, x: x - worldX * zoom, y: y - worldY * zoom }; this.apply();
  }
  private apply(): void {
    this.refs.canvas.style.transform = `translate(${this.state.transform.x}px, ${this.state.transform.y}px) scale(${this.state.transform.zoom})`;
    const label = `${Math.round(this.state.transform.zoom * 100)}%`;
    const zoomValue = document.getElementById('zoomValue'), stickyValue = document.getElementById('stickyZoomValue');
    if (zoomValue) zoomValue.textContent = label; if (stickyValue) stickyValue.textContent = label;
  }
}