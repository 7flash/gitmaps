import type { CanvasContext } from './context';
import { loadRepository } from './repo';
import { normalizeRepoPath, syncRepoPathToUrl } from './repo-route';

export function syncRepoSelection(path: string) {
  const clean = normalizeRepoPath(path);
  const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement | null;
  if (repoSelect) {
    if (clean && !Array.from(repoSelect.options).some(option => option.value === clean)) {
      const opt = document.createElement('option');
      opt.value = clean;
      opt.textContent = clean.split(/[\\/]/).filter(Boolean).pop() || clean;
      opt.title = clean;
      const newOpt = repoSelect.querySelector('option[value="__new__"]');
      if (newOpt) repoSelect.insertBefore(opt, newOpt); else repoSelect.add(opt);
    }
    repoSelect.value = clean;
  }
  const repoInput = document.getElementById('repoPath') as HTMLInputElement | null;
  if (repoInput) repoInput.value = clean;
}

export function handoffRepoLoad(ctx: CanvasContext, path: string) {
  const clean = normalizeRepoPath(path);
  syncRepoSelection(clean);
  syncRepoPathToUrl(clean);
  if ((ctx as any)?.onRepoReady) {
    (ctx as any).onRepoReady(clean);
    return;
  }
  loadRepository(ctx, clean);
}