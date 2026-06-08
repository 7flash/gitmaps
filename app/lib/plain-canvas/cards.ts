import { loadFileContent } from './api';
import { savePositions } from './state';
import type { CanvasRefs, CanvasState, FileRecord, Position } from './types';
import { addListener, escapeHtml, fileName, parentPath } from './utils';

const WIDTH = 450;
const HEIGHT = 360;
const GAP = 22;
const CONCURRENCY = 6;

export interface CardCallbacks {
  select(path: string, additive: boolean): void;
  open(path: string): void;
  menu(event: MouseEvent, path: string): void;
}

export class CardRenderer {
  private queue: string[] = [];
  private workers = 0;
  private loadId = 0;
  private disposers: Array<() => void> = [];

  constructor(private readonly state: CanvasState, private readonly refs: CanvasRefs, private readonly callbacks: CardCallbacks) {}

  dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }

  beginView(): void {
    this.loadId += 1;
    this.queue = [];
    this.workers = 0;
    this.dispose();
    this.state.files.clear();
    this.state.cards.clear();
    this.state.selected.clear();
    this.state.hidden.clear();
    this.refs.canvas.replaceChildren();
    this.updateCount();
  }

  addBatch(files: FileRecord[]): void {
    for (const file of files) {
      if (this.state.files.has(file.path)) continue;
      this.state.files.set(file.path, file);
      this.create(file, this.state.files.size - 1);
      if (!file.isBinary) this.queueContent(file.path);
    }
  }

  applyStatuses(files: FileRecord[]): void {
    for (const changed of files) {
      let file = this.state.files.get(changed.path);
      if (!file && changed.status === 'deleted') {
        file = changed;
        this.state.files.set(file.path, file);
        this.create(file, this.state.files.size - 1);
      }
      if (!file) continue;
      file.status = changed.status;
      const card = this.state.cards.get(file.path);
      if (card) this.updateStatusClass(card, file);
    }
  }

  selectionChanged(): void {
    for (const [path, card] of this.state.cards) card.classList.toggle('is-selected', this.state.selected.has(path));
    const toolbar = document.getElementById('arrangeToolbar') as HTMLElement | null;
    if (toolbar) toolbar.style.display = this.state.selected.size ? 'flex' : 'none';
  }

  visiblePositions(): Position[] {
    return Array.from(this.state.positions.entries())
      .filter(([path]) => this.state.cards.has(path) && !this.state.hidden.has(path))
      .map(([, position]) => position);
  }

  remove(paths: string[]): void {
    for (const path of paths) {
      this.state.hidden.add(path);
      this.state.cards.get(path)?.remove();
      this.state.cards.delete(path);
    }
    this.updateCount();
  }

  private position(path: string, index: number): Position {
    const existing = this.state.positions.get(path);
    if (existing) return existing;
    const columns = Math.max(1, Math.floor((this.refs.viewport.clientWidth - 60) / (WIDTH + GAP)));
    const position = { x: (index % columns) * (WIDTH + GAP), y: Math.floor(index / columns) * (HEIGHT + GAP), width: WIDTH, height: HEIGHT };
    this.state.positions.set(path, position);
    return position;
  }

  private create(file: FileRecord, index: number): void {
    const position = this.position(file.path, index);
    const card = document.createElement('article');
    card.dataset.path = file.path;
    card.style.left = `${position.x}px`;
    card.style.top = `${position.y}px`;
    card.style.width = `${position.width}px`;
    card.style.height = `${position.height}px`;
    card.innerHTML = `
      <header class="plain-card__header"><span class="plain-card__dot"></span><span class="plain-card__name" title="${escapeHtml(file.path)}">${escapeHtml(file.name || fileName(file.path))}</span><span class="plain-card__status"></span></header>
      <div class="plain-card__path" title="${escapeHtml(file.path)}">${escapeHtml(parentPath(file.path))}</div>
      <div class="plain-card__body"></div>`;
    this.updateStatusClass(card, file);
    this.state.cards.set(file.path, card);
    this.refs.canvas.appendChild(card);
    this.bindCard(card, file.path);
    if (file.isBinary) this.renderMessage(file.path, 'Binary file');
    else if (file.previewContent) this.renderCode(file.path, file.previewContent);
    else if (file.metaError || file.contentError) this.renderMessage(file.path, file.metaError || file.contentError || 'Unable to preview file');
    else this.renderMessage(file.path, 'Loading file…');
    this.updateCount();
  }

  private updateStatusClass(card: HTMLElement, file: FileRecord): void {
    card.className = `plain-card status-${file.status || 'unmodified'}${this.state.selected.has(file.path) ? ' is-selected' : ''}`;
    const status = card.querySelector<HTMLElement>('.plain-card__status');
    if (status) status.textContent = file.status || file.ext || '';
  }

  private bindCard(card: HTMLElement, path: string): void {
    const header = card.querySelector<HTMLElement>('.plain-card__header')!;
    let pointer: number | null = null;
    let originX = 0, originY = 0, startX = 0, startY = 0;

    addListener(this.disposers, header, 'pointerdown', ((event: PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const position = this.state.positions.get(path);
      if (!position) return;
      pointer = event.pointerId;
      originX = event.clientX; originY = event.clientY; startX = position.x; startY = position.y;
      header.setPointerCapture(pointer);
    }) as EventListener);

    addListener(this.disposers, header, 'pointermove', ((event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      const position = this.state.positions.get(path);
      if (!position) return;
      position.x = startX + (event.clientX - originX) / this.state.transform.zoom;
      position.y = startY + (event.clientY - originY) / this.state.transform.zoom;
      card.style.left = `${position.x}px`; card.style.top = `${position.y}px`;
    }) as EventListener);

    const release = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      try { header.releasePointerCapture(pointer); } catch {}
      pointer = null;
      savePositions(this.state);
    };
    addListener(this.disposers, header, 'pointerup', release as EventListener);
    addListener(this.disposers, header, 'pointercancel', release as EventListener);
    addListener(this.disposers, card, 'click', ((event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('.plain-card__body')) return;
      this.callbacks.select(path, event.shiftKey || event.ctrlKey || event.metaKey);
    }) as EventListener);
    addListener(this.disposers, card, 'dblclick', (() => this.callbacks.open(path)) as EventListener);
    addListener(this.disposers, card, 'contextmenu', ((event: MouseEvent) => { event.preventDefault(); this.callbacks.menu(event, path); }) as EventListener);
  }

  private queueContent(path: string): void { this.queue.push(path); this.runQueue(); }

  private runQueue(): void {
    while (this.workers < CONCURRENCY && this.queue.length) {
      const path = this.queue.shift()!;
      const viewId = this.loadId;
      this.workers += 1;
      loadFileContent(this.state.repoPath, this.state.ref, path, this.state.abort?.signal)
        .then(content => { if (viewId === this.loadId) this.renderCode(path, content); })
        .catch(error => { if (viewId === this.loadId && !this.state.abort?.signal.aborted) this.renderMessage(path, error.message || 'Unable to read file.'); })
        .finally(() => { this.workers -= 1; this.runQueue(); });
    }
  }

  private renderCode(path: string, content: string): void {
    const body = this.state.cards.get(path)?.querySelector<HTMLElement>('.plain-card__body');
    if (!body) return;
    const pre = document.createElement('pre');
    pre.textContent = content;
    body.replaceChildren(pre);
  }

  private renderMessage(path: string, message: string): void {
    const body = this.state.cards.get(path)?.querySelector<HTMLElement>('.plain-card__body');
    if (body) body.innerHTML = `<div class="plain-card__message">${escapeHtml(message)}</div>`;
  }

  private updateCount(): void { if (this.refs.fileCount) this.refs.fileCount.textContent = String(this.state.cards.size); }
}