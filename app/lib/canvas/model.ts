import { WORKING_TREE, type CanvasSnapshot, type FileRecord, type Position } from './types';

const POSITIONS_PREFIX = 'gitmaps:jsx-canvas:positions:';

export class CanvasModel {
  private listeners = new Set<() => void>();

  readonly state: CanvasSnapshot = {
    repoPath: '',
    ref: WORKING_TREE,
    commits: [],
    files: [],
    selected: new Set(),
    positions: new Map(),
    hidden: new Set(),
    transform: { x: 36, y: 30, zoom: 1 },
    loadingMessage: null,
    menu: null,
    modal: null,
    toast: null,
  };

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }

  beginRepository(path: string): void {
    this.state.repoPath = path;
    this.state.ref = WORKING_TREE;
    this.state.commits = [];
    this.beginView();
  }

  beginView(): void {
    this.state.files = [];
    this.state.selected = new Set();
    this.state.hidden = new Set();
    this.state.positions = this.loadPositions();
    this.state.menu = null;
    this.emit();
  }

  addFiles(batch: FileRecord[]): void {
    const existing = new Map(this.state.files.map(file => [file.path, file]));
    for (const file of batch) existing.set(file.path, file);
    this.state.files = Array.from(existing.values());
    this.emit();
  }

  updateFile(path: string, patch: Partial<FileRecord>, emit = true): void {
    this.state.files = this.state.files.map(file =>
      file.path === path ? { ...file, ...patch } : file,
    );
    if (emit) this.emit();
  }

  select(path: string, additive: boolean): void {
    const selected = new Set(additive ? this.state.selected : []);
    if (additive && selected.has(path)) selected.delete(path);
    else selected.add(path);
    this.state.selected = selected;
    this.emit();
  }

  clearSelection(): void {
    this.state.selected = new Set();
    this.state.menu = null;
    this.emit();
  }

  hide(paths: string[]): void {
    this.state.hidden = new Set([...this.state.hidden, ...paths]);
    this.state.selected = new Set();
    this.state.menu = null;
    this.emit();
  }

  setPosition(path: string, position: Position, emit = true): void {
    this.state.positions.set(path, position);
    if (emit) this.emit();
  }

  savePositions(): void {
    if (!this.state.repoPath) return;
    const output: Record<string, Position> = {};
    for (const [path, position] of this.state.positions) output[path] = position;
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(output));
    } catch {
      // Position saving is optional.
    }
  }

  private storageKey(): string {
    return `${POSITIONS_PREFIX}${this.state.repoPath}:${this.state.ref}`;
  }

  private loadPositions(): Map<string, Position> {
    const positions = new Map<string, Position>();
    if (!this.state.repoPath) return positions;

    try {
      const data = JSON.parse(localStorage.getItem(this.storageKey()) || '{}');
      for (const [path, value] of Object.entries(data as Record<string, Position>)) {
        if (
          Number.isFinite(value.x) &&
          Number.isFinite(value.y) &&
          Number.isFinite(value.width) &&
          Number.isFinite(value.height)
        ) positions.set(path, value);
      }
    } catch {
      // A corrupt saved layout should never block rendering.
    }
    return positions;
  }
}