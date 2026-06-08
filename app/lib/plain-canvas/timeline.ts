import type { CanvasRefs, Commit } from './types';
import { WORKING_TREE } from './types';
import { addListener, escapeHtml, fileName, shortDate } from './utils';

export class Timeline {
  private disposers: Array<() => void> = [];
  constructor(private readonly refs: CanvasRefs) {}
  dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }

  render(repoPath: string, commits: Commit[], current: string, select: (commit: string) => void): void {
    this.dispose();
    if (this.refs.commitCount) this.refs.commitCount.textContent = String(commits.length);
    if (!this.refs.timeline) return;
    const items = [{ hash: WORKING_TREE, message: 'All repository files', date: '' }, ...commits.filter(commit => commit.hash !== WORKING_TREE)];
    this.refs.timeline.innerHTML = items.map(commit => `
      <button class="plain-timeline ${current === commit.hash ? 'active' : ''}" data-ref="${escapeHtml(commit.hash)}">
        <strong>${commit.hash === WORKING_TREE ? 'All files' : escapeHtml(commit.hash.slice(0, 7))}${commit.date ? ` · ${escapeHtml(shortDate(commit.date))}` : ''}</strong>
        <span>${escapeHtml(commit.message)}</span>
      </button>`).join('');
    this.refs.timeline.querySelectorAll<HTMLButtonElement>('[data-ref]').forEach(button => {
      addListener(this.disposers, button, 'click', (() => select(button.dataset.ref!)) as EventListener);
    });
    if (!this.refs.currentCommit) return;
    if (current === WORKING_TREE) {
      this.refs.currentCommit.innerHTML = `<span class="commit-hash-label">All files</span><span style="margin-left:10px;color:#718198;font-size:12px">${escapeHtml(fileName(repoPath))}</span>`;
    } else {
      const commit = commits.find(item => item.hash === current);
      this.refs.currentCommit.innerHTML = `<span class="commit-hash-label">${escapeHtml(current.slice(0, 7))}</span><span style="margin-left:10px;color:#718198;font-size:12px">${escapeHtml(commit?.message || '')}</span>`;
    }
  }
}