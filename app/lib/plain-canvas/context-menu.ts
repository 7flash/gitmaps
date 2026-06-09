import type { CanvasState } from './types';
import type { ViewportController } from './viewport';
import type { CardRenderer } from './cards';

export interface MenuActions { open(path: string): void; history(paths: string[]): void; }

export class ContextMenu {
  private element: HTMLElement | null = null;
  constructor(private readonly state: CanvasState, private readonly cards: CardRenderer, private readonly viewport: ViewportController, private readonly actions: MenuActions) {}
  close(): void { this.element?.remove(); this.element = null; }
  open(event: MouseEvent, clickedPath: string): void {
    this.close();
    const paths = this.state.selected.has(clickedPath) ? Array.from(this.state.selected) : [clickedPath];
    const many = paths.length > 1;
    const menu = document.createElement('div');
    menu.className = 'plain-context';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.innerHTML = `
      <button data-action="open">Open full file</button>
      <button data-action="history">History${many ? ` (${paths.length} files)` : ''}</button>
      <hr />
      <button data-action="row">Arrange${many ? ' selected' : ''} in row</button>
      <button data-action="grid">Arrange${many ? ' selected' : ''} in grid</button>
      <hr />
      <button data-action="font-up">Increase font for ${many ? 'selected files' : 'this file'}</button>
      <button data-action="font-down">Decrease font for ${many ? 'selected files' : 'this file'}</button>
      <button data-action="font-reset">Reset file font</button>
      <button data-action="global-font-up">Increase global font</button>
      <button data-action="global-font-down">Decrease global font</button>
      <hr />
      <button data-action="hide">Hide from canvas</button>`;
    document.body.appendChild(menu);
    this.element = menu;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > innerWidth - 8) menu.style.left = `${innerWidth - rect.width - 8}px`;
      if (rect.bottom > innerHeight - 8) menu.style.top = `${innerHeight - rect.height - 8}px`;
    });
    menu.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => {
      this.close();
      switch (button.dataset.action) {
        case 'open': this.actions.open(clickedPath); break;
        case 'history': this.actions.history(paths); break;
        case 'row': this.viewport.arrange(paths, 'row'); break;
        case 'grid': this.viewport.arrange(paths, 'grid'); break;
        case 'font-up': this.cards.adjustFont(paths, 1); break;
        case 'font-down': this.cards.adjustFont(paths, -1); break;
        case 'font-reset': this.cards.resetFont(paths); break;
        case 'global-font-up': this.cards.adjustGlobalFont(1); break;
        case 'global-font-down': this.cards.adjustGlobalFont(-1); break;
        case 'hide': this.cards.remove(paths); this.state.selected.clear(); this.cards.selectionChanged(); break;
      }
    }));
  }
}
