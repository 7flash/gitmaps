/** @jsxImportSource tradjs/client */

import { render } from 'tradjs/client';
import { changedFiles, clone, fileContent, historyCompare, listRepositories, loadRepository, resolveSlug, streamTree, upload } from './api';
import { ContextMenuView, ModalView, TimelineView, ToastView, type CanvasActions } from './components';
import { CanvasModel } from './model';
import { WORKING_TREE, type DomRoots, type FileRecord, type Position } from './types';
import { bindRoots, clamp, fileName, listen, parentPath } from './utils';

const CARD_WIDTH = 450;
const CARD_HEIGHT = 360;
const CARD_GAP = 22;
const RECENT_REPOS_KEY = 'gitmaps:jsx-canvas:recent-repos';
const LAST_REPO_KEY = 'gitmaps:jsx-canvas:last-repo';
const LEGACY_RECENT_REPO_KEYS = [
  RECENT_REPOS_KEY,
  'gitmaps:plain-canvas:recent-repos',
  'gitmaps:recentRepos',
  'gitcanvas:recentRepos',
  'gitmaps:recentRepositories',
];

export class CanvasApplication {
  private readonly model = new CanvasModel();
  private readonly cardElements = new Map<string, HTMLElement>();
  private roots!: DomRoots;
  private disposers: Array<() => void> = [];
  private unsubscribe: (() => void) | null = null;
  private abort: AbortController | null = null;
  private loadId = 0;
  private contentQueue: string[] = [];
  private contentWorkers = 0;
  private toastTimer: number | null = null;
  private drag: { path: string; pointer: number; x: number; y: number; left: number; top: number } | null = null;
  private pan: { pointer: number; x: number; y: number; left: number; top: number } | null = null;
  private spaceDown = false;

  private readonly actions: CanvasActions = {
    select: (path, additive) => this.model.select(path, additive),
    openFile: path => void this.openFile(path),
    openMenu: (event, path) => this.openMenu(event, path),
    startCardDrag: (event, path) => this.startCardDrag(event, path),
    closeMenu: () => { this.model.state.menu = null; this.model.emit(); },
    history: paths => void this.openHistory(paths),
    arrange: (paths, mode) => this.arrange(paths, mode),
    hide: paths => this.model.hide(paths),
    closeModal: () => { this.model.state.modal = null; this.model.emit(); },
    selectCommit: ref => void this.openReference(ref),
  };

  mount(): void {
    this.roots = bindRoots();
    this.roots.canvas.replaceChildren();
    this.unsubscribe = this.model.subscribe(() => this.render());
    this.bindShell();
    this.bindViewport();
    this.render();
    void this.bootstrapRepositories();
  }

  dispose(): void {
    this.abort?.abort();
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    for (const dispose of this.disposers.splice(0)) dispose();
    this.unsubscribe?.();
    this.unsubscribe = null;
    render(null, this.roots?.canvas);
    render(null, this.roots?.menu);
    render(null, this.roots?.modal);
    render(null, this.roots?.toast);
  }

  private render(): void {
    const snapshot = this.model.state;

    this.renderCanvas(snapshot);
    render(<ContextMenuView snapshot={snapshot} actions={this.actions} />, this.roots.menu);
    render(<ModalView snapshot={snapshot} actions={this.actions} />, this.roots.modal);
    render(<ToastView snapshot={snapshot} />, this.roots.toast);

    if (this.roots.timeline) {
      render(<TimelineView snapshot={snapshot} actions={this.actions} />, this.roots.timeline);
    }

    if (this.roots.fileCount) {
      this.roots.fileCount.textContent = String(
        snapshot.files.filter(file => !snapshot.hidden.has(file.path)).length,
      );
    }

    if (this.roots.commitCount) this.roots.commitCount.textContent = String(snapshot.commits.length);
    this.renderCommitHeader();
    this.applyTransform();
  }

  private renderCanvas(snapshot: CanvasModel['state']): void {
    const visibleFiles = snapshot.files.filter(file => !snapshot.hidden.has(file.path));
    const visiblePaths = new Set(visibleFiles.map(file => file.path));

    for (const [path, element] of this.cardElements) {
      if (!visiblePaths.has(path)) {
        element.remove();
        this.cardElements.delete(path);
      }
    }

    const fragment = document.createDocumentFragment();
    visibleFiles.forEach((file, index) => {
      const position = snapshot.positions.get(file.path) || this.ensurePosition(file.path, index);
      const element = this.cardElements.get(file.path) || this.createCardElement(file.path);
      this.updateCardElement(element, file, position, snapshot.selected.has(file.path));
      this.cardElements.set(file.path, element);
      fragment.appendChild(element);
    });

    this.roots.canvas.replaceChildren(fragment);
  }

  private createCardElement(path: string): HTMLElement {
    const card = document.createElement('article');
    card.dataset.filePath = path;

    const header = document.createElement('header');
    header.className = 'plain-card__header';
    header.addEventListener('pointerdown', event => this.actions.startCardDrag(event, path));

    const dot = document.createElement('span');
    dot.className = 'plain-card__dot';

    const name = document.createElement('span');
    name.className = 'plain-card__name';

    const status = document.createElement('span');
    status.className = 'plain-card__status';

    header.append(dot, name, status);

    const cardPath = document.createElement('div');
    cardPath.className = 'plain-card__path';

    const body = document.createElement('div');
    body.className = 'plain-card__body';

    card.append(header, cardPath, body);

    card.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('.plain-card__body')) return;
      this.actions.select(path, event.shiftKey || event.ctrlKey || event.metaKey);
    });

    card.addEventListener('dblclick', () => {
      void this.openFile(path);
    });

    card.addEventListener('contextmenu', event => {
      event.preventDefault();
      this.actions.openMenu(event, path);
    });

    return card;
  }

  private updateCardElement(element: HTMLElement, file: FileRecord, position: Position, selected: boolean): void {
    element.className = `plain-card status-${file.status || 'unmodified'}${selected ? ' is-selected' : ''}`;
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
    element.style.width = `${position.width}px`;
    element.style.height = `${position.height}px`;
    element.dataset.filePath = file.path;

    const [header, pathNode, body] = Array.from(element.children) as [HTMLElement, HTMLElement, HTMLElement];
    const [, nameNode, statusNode] = Array.from(header.children) as [HTMLElement, HTMLElement, HTMLElement];

    nameNode.textContent = file.name || fileName(file.path);
    nameNode.title = file.path;
    statusNode.textContent = file.status || file.ext || '';
    pathNode.textContent = parentPath(file.path);
    pathNode.title = file.path;

    this.renderCardBody(body, file);
  }

  private renderCardBody(body: HTMLElement, file: FileRecord): void {
    let nextTag = 'div';
    let nextClass = 'plain-card__message';
    let nextText = 'Loading file…';

    if (file.isBinary) {
      nextText = 'Binary file';
    } else if (file.contentError || file.metaError) {
      nextText = file.contentError || file.metaError || 'Unable to load file';
    } else if (typeof file.content === 'string') {
      nextTag = 'pre';
      nextClass = '';
      nextText = file.content;
    } else if (file.previewContent) {
      nextTag = 'pre';
      nextClass = '';
      nextText = file.previewContent;
    }

    const existing = body.firstElementChild as HTMLElement | null;
    const needsReplace = !existing || existing.tagName.toLowerCase() !== nextTag || (nextClass && existing.className !== nextClass) || (!nextClass && existing.className);
    const content = needsReplace ? document.createElement(nextTag) : existing;

    if (nextClass) content.className = nextClass;
    else content.removeAttribute('class');
    content.textContent = nextText;

    if (needsReplace) body.replaceChildren(content);
  }

  private renderCommitHeader(): void {
    if (!this.roots.currentCommit) return;

    const current = this.model.state.ref;
    if (!this.model.state.repoPath) {
      this.roots.currentCommit.textContent = 'No repository selected';
      return;
    }

    const label = current === WORKING_TREE
      ? `All files · ${fileName(this.model.state.repoPath)}`
      : `${current.slice(0, 7)} · ${this.model.state.commits.find(commit => commit.hash === current)?.message || ''}`;

    this.roots.currentCommit.textContent = label;
  }

  private async openRepository(path: string): Promise<void> {
    this.beginLoad();
    this.model.beginRepository(path);
    this.rememberRepository(path);
    this.selectRepositoryOption(path);
    this.setLoading('Loading repository history…');
    if (this.roots.repoPath) this.roots.repoPath.value = path;

    try {
      this.model.state.commits = await loadRepository(path, this.abort!.signal);
      this.model.emit();
      await this.openReference(WORKING_TREE);
    } catch (error: any) {
      if (!this.abort?.signal.aborted) this.fail(`Cannot open repository: ${error.message}`);
    }
  }

  private async openReference(ref: string): Promise<void> {
    const path = this.model.state.repoPath;
    if (!path) return;

    this.beginLoad();
    this.model.state.ref = ref;
    this.model.beginView();
    this.setLoading(ref === WORKING_TREE ? 'Loading all files…' : 'Loading changed files…');
    const id = this.loadId;
    const signal = this.abort!.signal;

    try {
      if (ref === WORKING_TREE) {
        let total = 0;
        const statuses = changedFiles(path, WORKING_TREE, signal).catch(() => [] as FileRecord[]);

        await streamTree(path, signal, {
          onTotal: count => {
            total = count;
            this.setLoading(`Loading files… 0 / ${count}`);
          },
          onFiles: files => {
            if (id !== this.loadId) return;
            files.forEach((file, index) => this.ensurePosition(file.path, this.model.state.files.length + index));
            this.model.addFiles(files);
            this.setLoading(`Loading files… ${this.model.state.files.length} / ${total || this.model.state.files.length}`);
            files.forEach(file => this.queueContent(file.path));
          },
        });

        if (id !== this.loadId) return;
        for (const changed of await statuses) {
          this.model.updateFile(changed.path, { status: changed.status }, false);
        }
        this.model.emit();
      } else {
        const files = await changedFiles(path, ref, signal);
        files.forEach((file, index) => this.ensurePosition(file.path, index));
        this.model.addFiles(files);
        files.forEach(file => this.queueContent(file.path));
      }

      this.setLoading(null);
      this.fit();
      this.model.savePositions();
    } catch (error: any) {
      if (!signal.aborted && id === this.loadId) this.fail(`Unable to render files: ${error.message}`);
    }
  }

  private beginLoad(): void {
    this.abort?.abort();
    this.abort = new AbortController();
    this.loadId += 1;
    this.contentQueue = [];
    this.contentWorkers = 0;
  }

  private ensurePosition(path: string, index: number): Position {
    const existing = this.model.state.positions.get(path);
    if (existing) return existing;

    const columns = Math.max(1, Math.floor((this.roots.viewport.clientWidth - 60) / (CARD_WIDTH + CARD_GAP)));
    const position = {
      x: (index % columns) * (CARD_WIDTH + CARD_GAP),
      y: Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP),
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    };
    this.model.setPosition(path, position, false);
    return position;
  }

  private queueContent(path: string): void {
    this.contentQueue.push(path);
    this.pumpContent();
  }

  private pumpContent(): void {
    while (this.contentWorkers < 6 && this.contentQueue.length) {
      const path = this.contentQueue.shift()!;
      const id = this.loadId;
      this.contentWorkers += 1;

      fileContent(this.model.state.repoPath, this.model.state.ref, path, this.abort?.signal)
        .then(content => {
          if (id === this.loadId) this.model.updateFile(path, { content });
        })
        .catch(error => {
          if (id === this.loadId && !this.abort?.signal.aborted) {
            this.model.updateFile(path, { contentError: error.message });
          }
        })
        .finally(() => {
          this.contentWorkers -= 1;
          this.pumpContent();
        });
    }
  }

  private async openFile(path: string): Promise<void> {
    this.model.state.modal = { kind: 'preview', path, loading: true, content: '' };
    this.model.emit();

    try {
      const content = await fileContent(this.model.state.repoPath, this.model.state.ref, path);
      if (this.model.state.modal?.kind === 'preview' && this.model.state.modal.path === path) {
        this.model.state.modal = { kind: 'preview', path, loading: false, content };
        this.model.emit();
      }
    } catch (error: any) {
      this.model.state.modal = { kind: 'preview', path, loading: false, content: '', error: error.message };
      this.model.emit();
    }
  }

  private async openHistory(paths: string[]): Promise<void> {
    this.model.state.modal = { kind: 'history', paths, loading: true };
    this.model.emit();

    try {
      const result = await historyCompare(this.model.state.repoPath, paths);
      this.model.state.modal = { kind: 'history', paths, loading: false, result };
      this.model.emit();
    } catch (error: any) {
      this.model.state.modal = { kind: 'history', paths, loading: false, error: error.message };
      this.model.emit();
    }
  }

  private openMenu(event: MouseEvent, path: string): void {
    if (!this.model.state.selected.has(path)) this.model.select(path, false);
    this.model.state.menu = { x: event.clientX, y: event.clientY, path };
    this.model.emit();
  }

  private startCardDrag(event: PointerEvent, path: string): void {
    const position = this.model.state.positions.get(path);
    if (!position) return;

    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    this.drag = {
      path,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: position.x,
      top: position.y,
    };
  }

  private bindViewport(): void {
    listen(this.disposers, window, 'keydown', ((event: KeyboardEvent) => {
      if (event.code === 'Space') this.spaceDown = true;
      if (event.key === 'Escape') this.model.clearSelection();
      if ((event.key === 'Delete' || event.key === 'Backspace') && this.model.state.selected.size) {
        this.model.hide(Array.from(this.model.state.selected));
      }
    }) as EventListener);

    listen(this.disposers, window, 'keyup', ((event: KeyboardEvent) => {
      if (event.code === 'Space') this.spaceDown = false;
    }) as EventListener);

    listen(this.disposers, this.roots.viewport, 'pointerdown', ((event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('.plain-card') && !this.spaceDown && event.button !== 1) return;
      this.pan = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: this.model.state.transform.x,
        top: this.model.state.transform.y,
      };
      this.roots.viewport.setPointerCapture(event.pointerId);
    }) as EventListener);

    listen(this.disposers, window, 'pointermove', ((event: PointerEvent) => {
      if (this.drag?.pointer === event.pointerId) {
        const position = this.model.state.positions.get(this.drag.path)!;
        position.x = this.drag.left + (event.clientX - this.drag.x) / this.model.state.transform.zoom;
        position.y = this.drag.top + (event.clientY - this.drag.y) / this.model.state.transform.zoom;
        const card = this.roots.canvas.querySelector<HTMLElement>(`[data-file-path="${CSS.escape(this.drag.path)}"]`);
        if (card) {
          card.style.left = `${position.x}px`;
          card.style.top = `${position.y}px`;
        }
      }

      if (this.pan?.pointer === event.pointerId) {
        this.model.state.transform.x = this.pan.left + event.clientX - this.pan.x;
        this.model.state.transform.y = this.pan.top + event.clientY - this.pan.y;
        this.applyTransform();
      }
    }) as EventListener);

    listen(this.disposers, window, 'pointerup', ((event: PointerEvent) => {
      if (this.drag?.pointer === event.pointerId) {
        this.drag = null;
        this.model.savePositions();
      }
      if (this.pan?.pointer === event.pointerId) this.pan = null;
    }) as EventListener);

    listen(this.disposers, this.roots.viewport, 'wheel', ((event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('.plain-card__body') && !event.ctrlKey && !event.metaKey) return;
      if (!event.ctrlKey && !event.metaKey) return;

      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.zoomAt(event.clientX, event.clientY, factor);
    }) as EventListener, { passive: false });

    listen(this.disposers, document, 'pointerdown', ((event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.plain-context')) {
        this.model.state.menu = null;
        this.model.emit();
      }
    }) as EventListener);

    listen(this.disposers, document.getElementById('fitAll'), 'click', (() => this.fit()) as EventListener);
    listen(this.disposers, document.getElementById('stickyFitAll'), 'click', (() => this.fit()) as EventListener);
    listen(this.disposers, document.getElementById('resetView'), 'click', (() => this.resetTransform()) as EventListener);
    listen(this.disposers, document.getElementById('arrangeRow'), 'click', (() => this.arrange(Array.from(this.model.state.selected), 'row')) as EventListener);
    listen(this.disposers, document.getElementById('arrangeGrid'), 'click', (() => this.arrange(Array.from(this.model.state.selected), 'grid')) as EventListener);
  }

  private bindShell(): void {
    listen(this.disposers, this.roots.repoSelect, 'change', (() => {
      const value = this.roots.repoSelect!.value;
      if (!value) return;
      if (!value.startsWith('__')) void this.openRepository(value);
      if (value.startsWith('__')) this.roots.folderPicker?.click();
    }) as EventListener);

    listen(this.disposers, this.roots.folderPicker, 'change', (() => {
      const files = this.roots.folderPicker!.files;
      if (!files?.length) return;
      void upload(files).then(path => this.openRepository(path)).catch(error => this.fail(error.message));
    }) as EventListener);

    listen(this.disposers, document.getElementById('githubImportBtn'), 'click', (() => {
      const url = window.prompt('Paste a Git repository URL', 'https://github.com/')?.trim();
      if (!url) return;
      void clone(url, message => this.setLoading(message))
        .then(path => this.openRepository(path))
        .catch(error => this.fail(error.message));
    }) as EventListener);
  }

  private arrange(paths: string[], mode: 'row' | 'grid'): void {
    const targetPaths = paths.length ? paths : this.model.state.files.map(file => file.path);
    const columns = mode === 'row' ? targetPaths.length : Math.max(1, Math.ceil(Math.sqrt(targetPaths.length)));

    targetPaths.forEach((path, index) => {
      this.model.setPosition(path, {
        x: (index % columns) * (CARD_WIDTH + CARD_GAP),
        y: Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP),
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }, false);
    });
    this.model.savePositions();
    this.model.emit();
    this.fit();
  }

  private fit(): void {
    const positions = this.model.state.files
      .filter(file => !this.model.state.hidden.has(file.path))
      .map(file => this.model.state.positions.get(file.path))
      .filter(Boolean) as Position[];

    if (!positions.length) return;

    const minX = Math.min(...positions.map(position => position.x));
    const minY = Math.min(...positions.map(position => position.y));
    const maxX = Math.max(...positions.map(position => position.x + position.width));
    const maxY = Math.max(...positions.map(position => position.y + position.height));
    const margin = 38;

    const zoom = clamp(
      Math.min(
        (this.roots.viewport.clientWidth - margin * 2) / Math.max(maxX - minX, 1),
        (this.roots.viewport.clientHeight - margin * 2) / Math.max(maxY - minY, 1),
      ),
      0.14,
      1,
    );

    this.model.state.transform = { zoom, x: margin - minX * zoom, y: margin - minY * zoom };
    this.applyTransform();
  }

  private resetTransform(): void {
    this.model.state.transform = { x: 36, y: 30, zoom: 1 };
    this.applyTransform();
  }

  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.roots.viewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const old = this.model.state.transform.zoom;
    const zoom = clamp(old * factor, 0.12, 3);
    const worldX = (x - this.model.state.transform.x) / old;
    const worldY = (y - this.model.state.transform.y) / old;

    this.model.state.transform = { zoom, x: x - worldX * zoom, y: y - worldY * zoom };
    this.applyTransform();
  }

  private applyTransform(): void {
    const transform = this.model.state.transform;
    this.roots.canvas.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`;
  }

  private setLoading(message: string | null): void {
    this.model.state.loadingMessage = message;
    if (this.roots.cloneStatus) {
      this.roots.cloneStatus.style.display = message ? 'block' : 'none';
      this.roots.cloneStatus.textContent = message || '';
    }
    this.model.emit();
  }

  private fail(message: string): void {
    this.setLoading(message);
    this.model.state.toast = { message, kind: 'error' };
    this.model.emit();
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.model.state.toast = null;
      this.model.emit();
    }, 3200);
  }

  private async bootstrapRepositories(): Promise<void> {
    this.populateRepoSelect(this.readRecentRepositories());

    try {
      const discovered = await listRepositories();
      const merged = this.mergeRepositories(this.readRecentRepositories(), discovered.map(repo => repo.path));
      this.populateRepoSelect(merged);
    } catch {
      // Repo discovery is best-effort; recent repos are enough to stay usable.
    }

    const routePath = await this.getInitialPathFromRoute();
    if (routePath) {
      await this.openRepository(routePath);
      return;
    }

    const initial = this.roots.repoPath?.value?.trim() || this.roots.repoSelect?.value?.trim();
    if (initial && !initial.startsWith('__')) {
      await this.openRepository(initial);
    }
  }

  private async getInitialPathFromRoute(): Promise<string | null> {
    const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/' || pathname === '/galaxy-canvas') return null;

    const slug = pathname.replace(/^\/+/, '');
    if (!slug) return null;
    return await resolveSlug(slug).catch(() => null);
  }

  private readRecentRepositories(): string[] {
    const values: string[] = [];

    for (const key of LEGACY_RECENT_REPO_KEYS) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(parsed)) continue;
        for (const item of parsed) {
          const path = typeof item === 'string' ? item : item?.path;
          if (typeof path === 'string' && path.trim()) values.push(this.normalizeRepositoryPath(path));
        }
      } catch {
        // Ignore malformed old storage payloads.
      }
    }

    try {
      const last = localStorage.getItem(LAST_REPO_KEY);
      if (last?.trim()) values.unshift(this.normalizeRepositoryPath(last));
    } catch {
      // Storage is optional.
    }

    return Array.from(new Set(values.filter(Boolean)));
  }

  private rememberRepository(path: string): void {
    const normalized = this.normalizeRepositoryPath(path);
    const recent = [normalized, ...this.readRecentRepositories().filter(value => value !== normalized)].slice(0, 12);

    try {
      localStorage.setItem(LAST_REPO_KEY, normalized);
      localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(recent));
    } catch {
      // Storage is optional.
    }

    this.populateRepoSelect(recent);
  }

  private populateRepoSelect(paths: string[]): void {
    const select = this.roots.repoSelect;
    if (!select) return;

    const current = select.value;
    select.replaceChildren();

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select a repository...';
    select.appendChild(blank);

    for (const path of paths) {
      const option = document.createElement('option');
      option.value = path;
      option.textContent = fileName(path);
      option.title = path;
      select.appendChild(option);
    }

    const browse = document.createElement('option');
    browse.value = '__browse__';
    browse.textContent = '＋ Open folder…';
    select.appendChild(browse);

    if (current && paths.includes(current)) select.value = current;
  }

  private mergeRepositories(current: string[], incoming: string[]): string[] {
    return Array.from(new Set([...current, ...incoming.map(path => this.normalizeRepositoryPath(path))].filter(Boolean)));
  }

  private selectRepositoryOption(path: string): void {
    const select = this.roots.repoSelect;
    if (!select) return;

    const normalized = this.normalizeRepositoryPath(path);
    const existing = Array.from(select.options).some(option => option.value === normalized);
    if (!existing) this.populateRepoSelect(this.mergeRepositories(this.readRecentRepositories(), [normalized]));
    select.value = normalized;
  }

  private normalizeRepositoryPath(path: string): string {
    return path.trim().replace(/\\/g, '/');
  }
}
