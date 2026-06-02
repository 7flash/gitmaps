import { loadChangedFiles, loadRepository, streamTree } from './api';
import { CardRenderer } from './cards';
import { ContextMenu } from './context-menu';
import { bindCanvasDom } from './dom';
import { FileModals } from './history-modal';
import { RepositoryControls } from './repo-controls';
import { createState, loadPositions, savePositions } from './state';
import { installStyles } from './styles';
import { Timeline } from './timeline';
import { WORKING_TREE } from './types';
import type { CanvasRefs, FileRecord } from './types';
import { ViewportController } from './viewport';
import { addListener, clearStatus, statusMessage, toast } from './utils';

export class CanvasApp {
  private readonly state = createState();
  private refs!: CanvasRefs;
  private cards!: CardRenderer;
  private viewport!: ViewportController;
  private timeline!: Timeline;
  private modals!: FileModals;
  private menu!: ContextMenu;
  private controls!: RepositoryControls;
  private disposeStyles: (() => void) | null = null;
  private disposers: Array<() => void> = [];

  mount(): void {
    this.disposeStyles = installStyles();
    this.refs = bindCanvasDom();
    this.modals = new FileModals(this.state);
    this.timeline = new Timeline(this.refs);
    this.cards = new CardRenderer(this.state, this.refs, {
      select: (path, additive) => this.select(path, additive),
      open: path => void this.modals.openFile(path),
      menu: (event, path) => this.openMenu(event, path),
    });
    this.viewport = new ViewportController(this.state, this.refs, this.cards, () => this.clearSelection());
    this.menu = new ContextMenu(this.state, this.cards, this.viewport, {
      open: path => void this.modals.openFile(path),
      history: paths => void this.modals.openHistory(paths),
    });
    this.controls = new RepositoryControls(this.refs, path => this.openRepository(path));
    this.viewport.mount();
    this.controls.mount();
    this.bindKeyboard();
  }

  dispose(): void {
    this.state.abort?.abort();
    for (const dispose of this.disposers.splice(0)) dispose();
    this.controls?.dispose();
    this.viewport?.dispose();
    this.cards?.dispose();
    this.timeline?.dispose();
    this.modals?.close();
    this.menu?.close();
    this.disposeStyles?.();
    this.disposeStyles = null;
  }

  private async openRepository(path: string): Promise<void> {
    this.controls.select(path);
    this.state.repoPath = path;
    this.state.ref = WORKING_TREE;
    this.cancelLoad();
    const signal = this.state.abort!.signal;
    statusMessage(this.refs, 'Loading repository history…', 'loading');

    try {
      this.state.commits = await loadRepository(path, signal);
      this.renderTimeline();
      await this.openReference(WORKING_TREE);
    } catch (error: any) {
      if (!signal.aborted) {
        statusMessage(this.refs, `Cannot open repository: ${error.message}`, 'error');
        toast(`Cannot open repository: ${error.message}`, true);
      }
    }
  }

  private async openReference(ref: string): Promise<void> {
    this.state.ref = ref;
    loadPositions(this.state);
    this.cards.beginView();
    this.renderTimeline();
    this.cancelLoad();

    const loadId = ++this.state.loadId;
    const signal = this.state.abort!.signal;

    try {
      if (ref === WORKING_TREE) {
        let total = 0;
        const changed = loadChangedFiles(this.state.repoPath, WORKING_TREE, signal).catch(() => [] as FileRecord[]);

        await streamTree(
          this.state.repoPath,
          signal,
          count => {
            total = count;
            statusMessage(this.refs, `Loading files… 0 / ${count}`, 'loading');
          },
          files => {
            if (loadId !== this.state.loadId) return;
            this.cards.addBatch(files);
            statusMessage(this.refs, `Loading files… ${this.state.files.size} / ${total || this.state.files.size}`, 'loading');
            if (this.state.files.size === files.length) this.viewport.fit();
          },
        );

        if (loadId !== this.state.loadId) return;
        this.cards.applyStatuses(await changed);
      } else {
        const files = await loadChangedFiles(this.state.repoPath, ref, signal);
        if (loadId !== this.state.loadId) return;
        this.cards.addBatch(files);
      }

      clearStatus(this.refs);
      savePositions(this.state);
      if (this.state.cards.size) this.viewport.fit();
    } catch (error: any) {
      if (!signal.aborted && loadId === this.state.loadId) {
        statusMessage(this.refs, `Unable to render files: ${error.message}`, 'error');
        toast(`Unable to render files: ${error.message}`, true);
      }
    }
  }

  private cancelLoad(): void {
    this.state.abort?.abort();
    this.state.abort = new AbortController();
  }

  private renderTimeline(): void {
    this.timeline.render(this.state.repoPath, this.state.commits, this.state.ref, ref => void this.openReference(ref));
  }

  private select(path: string, additive: boolean): void {
    if (!additive) this.state.selected.clear();
    if (additive && this.state.selected.has(path)) this.state.selected.delete(path);
    else this.state.selected.add(path);
    this.cards.selectionChanged();
  }

  private clearSelection(): void {
    this.state.selected.clear();
    this.cards.selectionChanged();
    this.menu.close();
  }

  private openMenu(event: MouseEvent, path: string): void {
    if (!this.state.selected.has(path)) this.select(path, false);
    this.menu.open(event, path);
  }

  private bindKeyboard(): void {
    addListener(this.disposers, document, 'pointerdown', ((event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.plain-context')) this.menu.close();
    }) as EventListener);
    addListener(this.disposers, window, 'keydown', ((event: KeyboardEvent) => {
      if (event.key === 'Escape') { this.menu.close(); this.modals.close(); this.clearSelection(); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && this.state.selected.size) {
        this.cards.remove(Array.from(this.state.selected));
        this.clearSelection();
      }
    }) as EventListener);
  }
}
