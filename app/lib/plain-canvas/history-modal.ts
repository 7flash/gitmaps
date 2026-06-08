import { loadFileContent, loadHistoryComparison } from './api';
import type { CanvasState } from './types';
import { escapeHtml, fileName, shortDate } from './utils';

export class FileModals {
  private history: HTMLElement | null = null;
  private preview: HTMLElement | null = null;
  constructor(private readonly state: CanvasState) {}
  close(): void { this.history?.remove(); this.preview?.remove(); this.history = null; this.preview = null; }

  async openFile(path: string): Promise<void> {
    this.preview?.remove();
    const modal = document.createElement('div');
    modal.className = 'plain-modal';
    modal.innerHTML = `<div class="plain-modal__box"><header class="plain-modal__header"><div class="plain-modal__heading"><strong>${escapeHtml(fileName(path))}</strong><span>${escapeHtml(path)}</span></div><button class="plain-modal__close">×</button></header><pre class="plain-preview">Loading…</pre></div>`;
    document.body.appendChild(modal); this.preview = modal;
    modal.querySelector('button')!.addEventListener('click', () => modal.remove());
    try {
      const content = await loadFileContent(this.state.repoPath, this.state.ref, path);
      if (this.preview === modal) modal.querySelector('pre')!.textContent = content;
    } catch (error: any) {
      if (this.preview === modal) modal.querySelector('pre')!.textContent = error.message;
    }
  }

  async openHistory(paths: string[]): Promise<void> {
    this.history?.remove();
    const modal = document.createElement('div');
    modal.className = 'plain-modal';
    modal.innerHTML = `<div class="plain-modal__box"><header class="plain-modal__header"><div class="plain-modal__heading"><strong>File history comparison</strong><span>${escapeHtml(paths.length === 1 ? paths[0] : `${paths.length} selected files`)}</span></div><button class="plain-modal__close">×</button></header><div class="plain-history__message">Loading comparison…</div></div>`;
    document.body.appendChild(modal); this.history = modal;
    modal.querySelector('button')!.addEventListener('click', () => modal.remove());
    try {
      const result = await loadHistoryComparison(this.state.repoPath, paths);
      if (this.history !== modal) return;
      const box = modal.querySelector('.plain-modal__box')!;
      box.querySelector('.plain-history__message')?.remove();
      const scroll = document.createElement('div'); scroll.className = 'plain-history';
      const grid = document.createElement('div'); grid.className = 'plain-history__grid';
      grid.style.gridTemplateColumns = `250px repeat(${result.columns.length}, 360px)`;
      grid.innerHTML = `<div class="plain-history__corner">Files × versions</div>${result.columns.map(column => `<div class="plain-history__head"><strong>${escapeHtml(column.shortHash)}</strong><span>${escapeHtml(column.message)}</span><small>${escapeHtml(shortDate(column.date))}</small></div>`).join('')}${result.rows.map(row => `<div class="plain-history__file">${escapeHtml(row.name)}<span>${escapeHtml(row.path)}</span></div>${row.cells.map(cell => `<div class="plain-history__cell">${cell.changedFromOlder ? '<span class="plain-history__changed">●</span>' : ''}${!cell.exists || cell.binary ? `<div class="plain-history__message">${escapeHtml(cell.reason || (cell.binary ? 'Binary file' : 'File not present'))}</div>` : `<pre>${escapeHtml(cell.content || '')}${cell.truncated ? '\n\n— Truncated —' : ''}</pre>`}</div>`).join('')}`).join('')}`;
      scroll.appendChild(grid); box.appendChild(scroll);
    } catch (error: any) {
      const message = modal.querySelector('.plain-history__message'); if (message) message.textContent = error.message;
    }
  }
}