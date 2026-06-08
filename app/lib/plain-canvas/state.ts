import type { CanvasState, Position } from './types';
import { WORKING_TREE } from './types';

const LAST_REPO = 'gitmaps:plain-canvas:last-repo';
const RECENT_REPOS = 'gitmaps:plain-canvas:recent-repos';
const LAYOUT_PREFIX = 'gitmaps:plain-canvas:layout:';

export function createState(): CanvasState {
  return {
    repoPath: '',
    ref: WORKING_TREE,
    commits: [],
    files: new Map(),
    cards: new Map(),
    positions: new Map(),
    selected: new Set(),
    hidden: new Set(),
    transform: { x: 36, y: 30, zoom: 1 },
    loadId: 0,
    abort: null,
  };
}

export function rememberRepository(path: string): void {
  try {
    localStorage.setItem(LAST_REPO, path);
    const values = [path, ...readRecentRepositories().filter(value => value !== path)];
    localStorage.setItem(RECENT_REPOS, JSON.stringify(values.slice(0, 12)));
  } catch {
    // Browser storage is optional.
  }
}

export function lastRepository(): string | null {
  try {
    return localStorage.getItem(LAST_REPO);
  } catch {
    return null;
  }
}

export function readRecentRepositories(): string[] {
  const paths: string[] = [];
  for (const key of [RECENT_REPOS, 'gitmaps:recentRepos', 'gitcanvas:recentRepos', 'gitmaps:recentRepositories']) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        const path = typeof item === 'string' ? item : item?.path;
        if (typeof path === 'string' && path.trim()) paths.push(path.trim());
      }
    } catch {
      // Ignore incompatible old entries.
    }
  }
  const last = lastRepository();
  if (last) paths.unshift(last);
  return Array.from(new Set(paths));
}

function layoutKey(state: CanvasState): string {
  return `${LAYOUT_PREFIX}${state.repoPath}:${state.ref}`;
}

export function loadPositions(state: CanvasState): void {
  state.positions.clear();
  try {
    const raw = localStorage.getItem(layoutKey(state));
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Position>;
    for (const [path, position] of Object.entries(parsed)) {
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.width) && Number.isFinite(position.height)) {
        state.positions.set(path, position);
      }
    }
  } catch {
    // A broken layout never prevents a repository from loading.
  }
}

export function savePositions(state: CanvasState): void {
  try {
    const output: Record<string, Position> = {};
    for (const [path, position] of state.positions) output[path] = position;
    localStorage.setItem(layoutKey(state), JSON.stringify(output));
  } catch {
    // Browser storage is optional.
  }
}

export function clearView(state: CanvasState): void {
  state.files.clear();
  state.cards.clear();
  state.selected.clear();
  state.hidden.clear();
}