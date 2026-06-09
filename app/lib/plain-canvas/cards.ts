import { loadFileContent } from './api';
import { savePositions } from './state';
import type { CanvasRefs, CanvasState, FileRecord, Position } from './types';
import { addListener, escapeHtml, fileName, parentPath } from './utils';

const WIDTH = 450;
const HEIGHT = 360;
const GAP = 22;
const CONCURRENCY = 6;
const GLOBAL_FONT_KEY = 'gitmaps:plain-canvas:global-font-size';
const FILE_FONT_PREFIX = 'gitmaps:plain-canvas:file-font-size:';
const DEFAULT_FONT = 11;
const MIN_FONT = 7;
const MAX_FONT = 28;

interface DiffLine { type: string; content: string }
interface DiffHunk { oldStart: number; oldCount: number; newStart: number; newCount: number; context: string; lines: DiffLine[] }

export interface CardCallbacks {
  select(path: string, additive: boolean): void;
  open(path: string): void;
  menu(event: MouseEvent, path: string): void;
}

function clampFont(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT;
  return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(value)));
}

function readGlobalFont(): number {
  try { return clampFont(Number(localStorage.getItem(GLOBAL_FONT_KEY) || DEFAULT_FONT)); }
  catch { return DEFAULT_FONT; }
}

function fileFontKey(repoPath: string, filePath: string): string {
  return `${FILE_FONT_PREFIX}${repoPath}:${filePath}`;
}

function readFileFont(repoPath: string, filePath: string): number {
  try {
    const stored = localStorage.getItem(fileFontKey(repoPath, filePath));
    return stored ? clampFont(Number(stored)) : readGlobalFont();
  } catch { return readGlobalFont(); }
}

function writeFileFont(repoPath: string, filePath: string, size: number): void {
  try { localStorage.setItem(fileFontKey(repoPath, filePath), String(clampFont(size))); } catch {}
}

function clearFileFont(repoPath: string, filePath: string): void {
  try { localStorage.removeItem(fileFontKey(repoPath, filePath)); } catch {}
}

function writeGlobalFont(size: number): void {
  try { localStorage.setItem(GLOBAL_FONT_KEY, String(clampFont(size))); } catch {}
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

      const hasDiff = Array.isArray(file.hunks);
      if (!file.isBinary && !hasDiff && !file.previewContent && !file.contentError && !file.metaError) {
        this.queueContent(file.path);
      }
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
      file.hunks = changed.hunks;
      const card = this.state.cards.get(file.path);
      if (card) {
        this.updateStatusClass(card, file);
        if (Array.isArray(file.hunks)) this.renderDiff(file.path, file.hunks as DiffHunk[], file.contentError || undefined);
      }
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

  adjustFont(paths: string[], delta: number): void {
    const targets = paths.length ? paths : Array.from(this.state.cards.keys());
    for (const path of targets) {
      const next = readFileFont(this.state.repoPath, path) + delta;
      writeFileFont(this.state.repoPath, path, next);
      this.applyFont(path);
    }
  }

  resetFont(paths: string[]): void {
    const targets = paths.length ? paths : Array.from(this.state.cards.keys());
    for (const path of targets) {
      clearFileFont(this.state.repoPath, path);
      this.applyFont(path);
    }
  }

  adjustGlobalFont(delta: number): void {
    writeGlobalFont(readGlobalFont() + delta);
    for (const path of this.state.cards.keys()) this.applyFont(path);
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
    this.applyFont(file.path);
    this.bindCard(card, file.path);

    if (file.isBinary) this.renderMessage(file.path, 'Binary file');
    else if (Array.isArray(file.hunks)) this.renderDiff(file.path, file.hunks as DiffHunk[], file.contentError || undefined);
    else if (file.previewContent) this.renderCode(file.path, file.previewContent);
    else if (file.content) this.renderCode(file.path, file.content);
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
    let originX = 0;
    let originY = 0;
    let startPositions: Array<{ path: string; x: number; y: number }> = [];
    let moved = false;

    addListener(this.disposers, header, 'pointerdown', ((event: PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();

      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (additive || !this.state.selected.has(path)) this.callbacks.select(path, additive);

      const targets = this.state.selected.has(path) ? Array.from(this.state.selected) : [path];
      startPositions = targets
        .map(targetPath => {
          const pos = this.state.positions.get(targetPath);
          return pos ? { path: targetPath, x: pos.x, y: pos.y } : null;
        })
        .filter(Boolean) as Array<{ path: string; x: number; y: number }>;
      if (!startPositions.length) return;

      pointer = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      moved = false;
      header.setPointerCapture(pointer);
    }) as EventListener);

    addListener(this.disposers, header, 'pointermove', ((event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      const dx = (event.clientX - originX) / this.state.transform.zoom;
      const dy = (event.clientY - originY) / this.state.transform.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      for (const start of startPositions) {
        const position = this.state.positions.get(start.path);
        const targetCard = this.state.cards.get(start.path);
        if (!position || !targetCard) continue;
        position.x = start.x + dx;
        position.y = start.y + dy;
        targetCard.style.left = `${position.x}px`;
        targetCard.style.top = `${position.y}px`;
      }
    }) as EventListener);

    const release = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      try { header.releasePointerCapture(pointer); } catch {}
      pointer = null;
      startPositions = [];
      if (moved) savePositions(this.state);
    };
    addListener(this.disposers, header, 'pointerup', release as EventListener);
    addListener(this.disposers, header, 'pointercancel', release as EventListener);

    addListener(this.disposers, card, 'click', ((event: MouseEvent) => {
      if (moved) { moved = false; return; }
      const target = event.target as HTMLElement;
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (!additive && target.closest('.plain-card__body')) return;
      event.stopPropagation();
      this.callbacks.select(path, additive);
    }) as EventListener);

    addListener(this.disposers, card, 'dblclick', ((event: MouseEvent) => {
      event.stopPropagation();
      this.callbacks.open(path);
    }) as EventListener);

    const openMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      this.callbacks.menu(event, path);
    };
    addListener(this.disposers, card, 'contextmenu', openMenu as EventListener);
    const body = card.querySelector<HTMLElement>('.plain-card__body');
    addListener(this.disposers, body, 'contextmenu', openMenu as EventListener);
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

  private applyFont(path: string): void {
    const card = this.state.cards.get(path);
    if (!card) return;
    const size = readFileFont(this.state.repoPath, path);
    card.style.setProperty('--plain-code-font-size', `${size}px`);
  }

  private renderCode(path: string, content: string): void {
    const body = this.state.cards.get(path)?.querySelector<HTMLElement>('.plain-card__body');
    if (!body) return;
    const pre = document.createElement('pre');
    pre.textContent = content;
    body.replaceChildren(pre);
  }

  private renderDiff(path: string, hunks: DiffHunk[], error?: string): void {
    if (error) return this.renderMessage(path, error);
    const body = this.state.cards.get(path)?.querySelector<HTMLElement>('.plain-card__body');
    if (!body) return;
    if (!hunks.length) {
      this.renderMessage(path, 'No textual diff for this file.');
      return;
    }

    const pre = document.createElement('pre');
    pre.className = 'plain-diff';
    for (const hunk of hunks) {
      const h = document.createElement('span');
      h.className = 'plain-diff__hunk';
      h.textContent = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context ? ` ${hunk.context}` : ''}\n`;
      pre.appendChild(h);
      for (const line of hunk.lines || []) {
        const span = document.createElement('span');
        span.className = `plain-diff__line plain-diff__line--${line.type}`;
        const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
        span.textContent = `${prefix}${line.content}\n`;
        pre.appendChild(span);
      }
    }
    body.replaceChildren(pre);
  }

  private renderMessage(path: string, message: string): void {
    const body = this.state.cards.get(path)?.querySelector<HTMLElement>('.plain-card__body');
    if (body) body.innerHTML = `<div class="plain-card__message">${escapeHtml(message)}</div>`;
  }

  private updateCount(): void { if (this.refs.fileCount) this.refs.fileCount.textContent = String(this.state.cards.size); }
}
