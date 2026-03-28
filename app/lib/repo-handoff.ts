import type { CanvasContext } from './context';
import { loadRepository } from './repo';

export function syncRepoSelection(path: string) {
  const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement | null;
  if (repoSelect) repoSelect.value = path;
}

export function handoffRepoLoad(ctx: CanvasContext, path: string) {
  syncRepoSelection(path);
  if ((ctx as any)?.onRepoReady) {
    (ctx as any).onRepoReady(path);
    return;
  }
  loadRepository(ctx, path);
}
