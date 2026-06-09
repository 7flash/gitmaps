import { savePositions } from './state';
import type { CanvasRefs, CanvasState } from './types';
import { addListener, clamp } from './utils';
import type { CardRenderer } from './cards';

const WIDTH = 450, HEIGHT = 360, GAP = 22;

type PointerMode = 'pan' | 'select' | null;

export class ViewportController {
  private disposers: Array<() => void> = [];
  private space = false;
  constructor(private readonly state: CanvasState, private readonly refs: CanvasRefs, private readonly cards: CardRenderer, private readonly clearSelection: () => void) {}

  mount(): void {
    let pointer: number | null = null;
    let mode: PointerMode = null;
    let startClientX = 0, startClientY = 0, startX = 0, startY = 0;
    let selectBox: HTMLElement | null = null;
    let additiveSelection = false;

    addListener(this.disposers, window, 'keydown', ((event: KeyboardEvent) => {
      if (event.code === 'Space') this.space = true;
      if (event.key === 'Escape') this.clearSelection();
    }) as EventListener);
    addListener(this.disposers, window, 'keyup', ((event: KeyboardEvent) => { if (event.code === 'Space') this.space = false; }) as EventListener);

    addListener(this.disposers, this.refs.viewport, 'pointerdown', ((event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.plain-card') || target.closest('.plain-context')) return;
      if (event.button === 2) return;

      pointer = event.pointerId;
      startClientX = event.clientX;
      startClientY = event.clientY;
      startX = this.state.transform.x;
      startY = this.state.transform.y;
      additiveSelection = event.shiftKey || event.ctrlKey || event.metaKey;

      if (event.button === 1 || this.space) {
        mode = 'pan';
        this.refs.viewport.setPointerCapture(pointer);
        return;
      }

      if (event.button === 0) {
        mode = 'select';
        selectBox = document.createElement('div');
        selectBox.className = 'plain-selection-box';
        this.refs.viewport.appendChild(selectBox);
        this.updateSelectionBox(selectBox, startClientX, startClientY, event.clientX, event.clientY);
        this.refs.viewport.setPointerCapture(pointer);
      }
    }) as EventListener);

    addListener(this.disposers, this.refs.viewport, 'pointermove', ((event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      if (mode === 'pan') {
        this.state.transform.x = startX + event.clientX - startClientX;
        this.state.transform.y = startY + event.clientY - startClientY;
        this.apply();
        return;
      }
      if (mode === 'select' && selectBox) {
        this.updateSelectionBox(selectBox, startClientX, startClientY, event.clientX, event.clientY);
      }
    }) as EventListener);

    const stop = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      try { this.refs.viewport.releasePointerCapture(pointer); } catch {}
      if (mode === 'select') {
        const moved = Math.abs(event.clientX - startClientX) > 4 || Math.abs(event.clientY - startClientY) > 4;
        if (!additiveSelection && !moved) this.state.selected.clear();
        if (moved) this.selectCardsInBox(startClientX, startClientY, event.clientX, event.clientY, additiveSelection);
        this.cards.selectionChanged();
        selectBox?.remove();
        selectBox = null;
      }
      pointer = null;
      mode = null;
    };
    addListener(this.disposers, this.refs.viewport, 'pointerup', stop as EventListener);
    addListener(this.disposers, this.refs.viewport, 'pointercancel', stop as EventListener);

    addListener(this.disposers, this.refs.viewport, 'wheel', ((event: WheelEvent) => {
      const inFileScroll = Boolean((event.target as HTMLElement).closest('.plain-card__body'));
      if (inFileScroll && !event.ctrlKey && !event.metaKey) return;
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1);
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
    const positions = this.cards.visiblePositions();
    if (!positions.length) return this.reset();
    const minX = Math.min(...positions.map(p => p.x)), minY = Math.min(...positions.map(p => p.y));
    const maxX = Math.max(...positions.map(p => p.x + p.width)), maxY = Math.max(...positions.map(p => p.y + p.height));
    const margin = 38;
    const zoom = clamp(Math.min((this.refs.viewport.clientWidth - margin * 2) / Math.max(maxX - minX, 1), (this.refs.viewport.clientHeight - margin * 2) / Math.max(maxY - minY, 1)), 0.14, 1);
    this.state.transform = { zoom, x: margin - minX * zoom, y: margin - minY * zoom };
    this.apply();
  }

  arrange(paths: string[], mode: 'row' | 'grid'): void {
    const targets = paths.length ? paths : Array.from(this.state.cards.keys());
    const columns = mode === 'row' ? Math.max(1, targets.length) : Math.max(1, Math.ceil(Math.sqrt(targets.length)));
    targets.forEach((path, index) => {
      const position = this.state.positions.get(path), card = this.state.cards.get(path);
      if (!position || !card) return;
      position.x = (index % columns) * (WIDTH + GAP);
      position.y = Math.floor(index / columns) * (HEIGHT + GAP);
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
    });
    savePositions(this.state);
    this.fit();
  }

  private updateSelectionBox(box: HTMLElement, x1: number, y1: number, x2: number, y2: number): void {
    const rect = this.refs.viewport.getBoundingClientRect();
    const left = Math.min(x1, x2) - rect.left;
    const top = Math.min(y1, y2) - rect.top;
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  }

  private clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.refs.viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.state.transform.x) / this.state.transform.zoom,
      y: (clientY - rect.top - this.state.transform.y) / this.state.transform.zoom,
    };
  }

  private selectCardsInBox(x1: number, y1: number, x2: number, y2: number, additive: boolean): void {
    const a = this.clientToWorld(x1, y1);
    const b = this.clientToWorld(x2, y2);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    if (!additive) this.state.selected.clear();
    for (const [path, pos] of this.state.positions) {
      if (!this.state.cards.has(path) || this.state.hidden.has(path)) continue;
      const intersects = pos.x < right && pos.x + pos.width > left && pos.y < bottom && pos.y + pos.height > top;
      if (intersects) this.state.selected.add(path);
    }
  }

  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.refs.viewport.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const oldZoom = this.state.transform.zoom;
    const zoom = clamp(oldZoom * factor, 0.12, 3);
    const worldX = (x - this.state.transform.x) / oldZoom, worldY = (y - this.state.transform.y) / oldZoom;
    this.state.transform = { zoom, x: x - worldX * zoom, y: y - worldY * zoom };
    this.apply();
  }

  private apply(): void {
    this.refs.canvas.style.transform = `translate(${this.state.transform.x}px, ${this.state.transform.y}px) scale(${this.state.transform.zoom})`;
    const label = `${Math.round(this.state.transform.zoom * 100)}%`;
    const zoomValue = document.getElementById('zoomValue'), stickyValue = document.getElementById('stickyZoomValue');
    if (zoomValue) zoomValue.textContent = label;
    if (stickyValue) stickyValue.textContent = label;
  }
}
