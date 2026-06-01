/**
 * app/page.client.tsx
 *
 * First-principles GitMaps client.
 *
 * No XState.
 * No CanvasContext.
 * No card manager.
 * No mount-init / events / repo orchestration imports.
 *
 * One plain state object owns:
 * - repository selection and loading
 * - currently viewed ref
 * - commit timeline
 * - file cards and selection
 * - canvas viewport transform
 * - card positions
 * - context menu
 * - file preview modal
 * - multi-file history comparison modal
 *
 * Server contract used by the clean implementation:
 *
 * GET /api/repo/list
 *   -> {
 *        repos: Array<string | { path: string; name?: string }>,
 *        defaultRepo?: string | { path: string; name?: string } | null
 *      }
 *
 * POST /api/repo/view
 *   body: { path: string; ref: "__working__" | string }
 *   -> {
 *        commits: Array<{
 *          hash: string;
 *          shortHash?: string;
 *          message: string;
 *          author?: string;
 *          date: string;
 *        }>;
 *        files: Array<{
 *          path: string;
 *          name?: string;
 *          status?: string;
 *          lines?: number;
 *          content?: string | null;
 *          contentError?: string | null;
 *        }>;
 *        totalFiles?: number;
 *      }
 *
 * Existing routes reused without redesign:
 *
 * POST /api/repo/file-content
 *   body: { path: string; commit: "__working__" | string; filePath: string }
 *   -> { content: string; truncated?: boolean }
 *
 * POST /api/repo/file-history
 *   body: { path: string; filePath: string; limit: number }
 *   -> { commits: Commit[] }
 *
 * POST /api/repo/clone-stream
 *   body: { url: string }
 *   -> SSE progress / done / error
 *
 * Temporary compatibility fallback:
 * If /api/repo/view is not yet implemented, this client falls back to
 * POST /api/repo/files and displays changed files only. Remove that fallback
 * once /api/repo/view is in place.
 */

type Ref = '__working__' | string;

type Repository = {
    path: string;
    name: string;
};

type Commit = {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
};

type FileRecord = {
    path: string;
    name: string;
    status: string;
    lines: number;
    content?: string | null;
    contentError?: string | null;
};

type CardPosition = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type ViewResponse = {
    commits: Commit[];
    files: FileRecord[];
    totalFiles: number;
    partial?: boolean;
};

type HistoryCell = {
    loading: boolean;
    content: string | null;
    error: string | null;
    truncated: boolean;
};

type HistoryColumn = {
    ref: Ref;
    title: string;
    subtitle: string;
    date: string;
};

type AppState = {
    repo: Repository | null;
    repos: Repository[];
    ref: Ref;
    commits: Commit[];
    files: FileRecord[];
    selected: Set<string>;
    hidden: Set<string>;
    positions: Map<string, CardPosition>;
    transform: {
        x: number;
        y: number;
        zoom: number;
    };
    loading: boolean;
    partialView: boolean;
    disposed: boolean;
    loadSequence: number;
    activeAbort: AbortController | null;
};

type Roots = {
    canvasArea: HTMLElement;
    viewport: HTMLElement;
    canvas: HTMLElement;
    repoSelect: HTMLSelectElement | null;
    repoPath: HTMLInputElement | null;
    cloneStatus: HTMLElement | null;
    timeline: HTMLElement | null;
    commitCount: HTMLElement | null;
    currentCommitInfo: HTMLElement | null;
    fileCount: HTMLElement | null;
    zoomSlider: HTMLInputElement | null;
    zoomValue: HTMLElement | null;
    stickyZoomSlider: HTMLInputElement | null;
    stickyZoomValue: HTMLElement | null;
};

declare global {
    interface Window {
        __gitmaps_cleanup__?: () => void;
    }
}

const WORKING_REF: Ref = '__working__';
const LAST_REPOSITORY_KEY = 'gitmaps:first-principles:last-repository';
const POSITIONS_KEY_PREFIX = 'gitmaps:first-principles:positions:';
const MAX_PREVIEW_LINES = 36;
const HISTORY_COMMIT_LIMIT = 8;
const CARD_WIDTH = 430;
const CARD_HEIGHT = 320;
const CARD_GAP = 22;

const state: AppState = {
    repo: null,
    repos: [],
    ref: WORKING_REF,
    commits: [],
    files: [],
    selected: new Set(),
    hidden: new Set(),
    positions: new Map(),
    transform: { x: 48, y: 42, zoom: 1 },
    loading: false,
    partialView: false,
    disposed: false,
    loadSequence: 0,
    activeAbort: null,
};

let roots: Roots | null = null;
let removeListeners: Array<() => void> = [];
let toastTimer: number | null = null;
let styleNode: HTMLStyleElement | null = null;
let menuNode: HTMLElement | null = null;
let previewModalNode: HTMLElement | null = null;
let historyModalNode: HTMLElement | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget | null | undefined,
    event: K | string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
): void {
    if (!target) return;
    target.addEventListener(event, handler, options);
    removeListeners.push(() => target.removeEventListener(event, handler, options));
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function filename(path: string): string {
    return path.replaceAll('\\', '/').split('/').filter(Boolean).pop() || path;
}

function dirname(path: string): string {
    const bits = path.replaceAll('\\', '/').split('/');
    bits.pop();
    return bits.join('/');
}

function repoName(path: string): string {
    return filename(path.replace(/[\\/]+$/, ''));
}

function shortDate(date: string): string {
    if (!date) return '';
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return date;
    return value.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function errorText(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || 'Unknown error');
}

function statusClass(status: string): string {
    switch (status) {
        case 'added': return 'gc-status-added';
        case 'deleted': return 'gc-status-deleted';
        case 'renamed': return 'gc-status-renamed';
        case 'copied': return 'gc-status-copied';
        case 'modified': return 'gc-status-modified';
        default: return 'gc-status-neutral';
    }
}

function normalizedRepo(raw: unknown): Repository | null {
    if (typeof raw === 'string') {
        const path = raw.trim();
        return path ? { path, name: repoName(path) } : null;
    }

    if (!raw || typeof raw !== 'object') return null;

    const value = raw as Record<string, unknown>;
    const path = typeof value.path === 'string'
        ? value.path.trim()
        : typeof value.repoPath === 'string'
            ? value.repoPath.trim()
            : '';

    if (!path) return null;

    const name = typeof value.name === 'string' && value.name.trim()
        ? value.name.trim()
        : repoName(path);

    return { path, name };
}

function normalizedCommit(raw: any): Commit {
    const hash = String(raw?.hash || '');
    return {
        hash,
        shortHash: String(raw?.shortHash || hash.slice(0, 7)),
        message: String(raw?.message || 'Untitled commit'),
        author: String(raw?.author || raw?.author_name || ''),
        date: String(raw?.date || ''),
    };
}

function normalizedFile(raw: any): FileRecord | null {
    const path = typeof raw?.path === 'string' ? raw.path : '';
    if (!path) return null;

    return {
        path,
        name: typeof raw.name === 'string' && raw.name ? raw.name : filename(path),
        status: typeof raw.status === 'string' ? raw.status : 'unmodified',
        lines: typeof raw.lines === 'number' ? raw.lines : 0,
        content: typeof raw.content === 'string' ? raw.content : null,
        contentError: typeof raw.contentError === 'string' ? raw.contentError : null,
    };
}

function persistRepository(): void {
    if (!state.repo) return;
    try {
        localStorage.setItem(LAST_REPOSITORY_KEY, state.repo.path);
    } catch {
        // Storage failure is non-fatal.
    }
}

function storedRepository(): string | null {
    try {
        return localStorage.getItem(LAST_REPOSITORY_KEY);
    } catch {
        return null;
    }
}

function positionsStorageKey(): string | null {
    if (!state.repo) return null;
    return `${POSITIONS_KEY_PREFIX}${state.repo.path}:${state.ref}`;
}

function loadPositions(): void {
    state.positions.clear();
    const key = positionsStorageKey();
    if (!key) return;

    try {
        const value = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, CardPosition>;
        for (const [path, position] of Object.entries(value)) {
            if (
                position &&
                Number.isFinite(position.x) &&
                Number.isFinite(position.y) &&
                Number.isFinite(position.width) &&
                Number.isFinite(position.height)
            ) {
                state.positions.set(path, position);
            }
        }
    } catch {
        // Invalid saved layout should not break repository opening.
    }
}

function savePositions(): void {
    const key = positionsStorageKey();
    if (!key) return;

    const payload: Record<string, CardPosition> = {};
    for (const [path, position] of state.positions) {
        payload[path] = position;
    }

    try {
        localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // Storage failure is non-fatal.
    }
}

async function requestJson<T>(
    url: string,
    init: RequestInit = {},
    signal?: AbortSignal,
): Promise<T> {
    const response = await fetch(url, {
        ...init,
        signal,
        headers: {
            Accept: 'application/json',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers || {}),
        },
    });

    const bodyText = await response.text();
    let body: any = {};

    if (bodyText) {
        try {
            body = JSON.parse(bodyText);
        } catch {
            body = { error: bodyText };
        }
    }

    if (!response.ok) {
        const error = new Error(body.error || `${response.status} ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
    }

    return body as T;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return requestJson<T>(
        url,
        {
            method: 'POST',
            body: JSON.stringify(body),
        },
        signal,
    );
}

function showStatus(message: string, kind: 'loading' | 'success' | 'error' | 'neutral' = 'neutral'): void {
    const element = roots?.cloneStatus;
    if (!element) return;

    element.style.display = '';
    element.className = `clone-status ${kind}`;
    element.textContent = message;
}

function hideStatus(): void {
    const element = roots?.cloneStatus;
    if (!element) return;

    element.style.display = 'none';
    element.textContent = '';
    element.className = 'clone-status';
}

function toast(message: string, kind: 'normal' | 'error' = 'normal'): void {
    document.querySelector('.gc-toast')?.remove();

    const node = document.createElement('div');
    node.className = `gc-toast ${kind === 'error' ? 'gc-toast-error' : ''}`;
    node.textContent = message;
    document.body.appendChild(node);

    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => node.remove(), 3200);
}

function ensureCanvasRoots(): Roots {
    const canvasArea = document.querySelector('.canvas-area') as HTMLElement | null;
    if (!canvasArea) {
        throw new Error('The layout must contain .canvas-area.');
    }

    let viewport = byId<HTMLElement>('canvasViewport');
    let canvas = byId<HTMLElement>('canvasContent');

    if (!viewport) {
        viewport = document.createElement('div');
        viewport.id = 'canvasViewport';
        viewport.className = 'gc-viewport';
        canvasArea.prepend(viewport);
    }

    if (!canvas) {
        canvas = document.createElement('div');
        canvas.id = 'canvasContent';
        canvas.className = 'gc-canvas';
        viewport.appendChild(canvas);
    } else if (canvas.parentElement !== viewport) {
        viewport.appendChild(canvas);
    }

    viewport.classList.add('gc-viewport');
    canvas.classList.add('gc-canvas');

    return {
        canvasArea,
        viewport,
        canvas,
        repoSelect: byId<HTMLSelectElement>('repoSelect'),
        repoPath: byId<HTMLInputElement>('repoPath'),
        cloneStatus: byId<HTMLElement>('cloneStatus'),
        timeline: byId<HTMLElement>('timelineContainer'),
        commitCount: byId<HTMLElement>('commitCount'),
        currentCommitInfo: byId<HTMLElement>('currentCommitInfo'),
        fileCount: byId<HTMLElement>('fileCount'),
        zoomSlider: byId<HTMLInputElement>('zoomSlider'),
        zoomValue: byId<HTMLElement>('zoomValue'),
        stickyZoomSlider: byId<HTMLInputElement>('stickyZoomSlider'),
        stickyZoomValue: byId<HTMLElement>('stickyZoomValue'),
    };
}

function injectStyles(): void {
    styleNode?.remove();

    styleNode = document.createElement('style');
    styleNode.dataset.gitmapsFirstPrinciples = 'true';
    styleNode.textContent = `
.gc-viewport {
    position: absolute;
    inset: 54px 0 0 0;
    overflow: hidden;
    background: var(--bg-primary, #080a12);
    cursor: grab;
}
.gc-viewport.gc-panning { cursor: grabbing; }
.gc-canvas {
    position: absolute;
    inset: 0;
    transform-origin: 0 0;
    will-change: transform;
}
.gc-empty {
    position: absolute;
    left: 50%;
    top: 44%;
    transform: translate(-50%, -50%);
    width: min(520px, calc(100vw - 80px));
    padding: 28px;
    border: 1px dashed rgba(148,163,184,.22);
    border-radius: 18px;
    text-align: center;
    color: var(--text-muted, #94a3b8);
    background: rgba(15,23,42,.30);
}
.gc-empty strong {
    display: block;
    color: var(--text-primary, #e2e8f0);
    margin-bottom: 9px;
    font-size: 16px;
}
.gc-card {
    position: absolute;
    width: ${CARD_WIDTH}px;
    height: ${CARD_HEIGHT}px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-card, #0f1422);
    border: 1px solid var(--border, rgba(148,163,184,.17));
    border-radius: 13px;
    box-shadow: 0 16px 34px rgba(0,0,0,.20);
    transition: border-color .12s ease, box-shadow .12s ease;
}
.gc-card:hover {
    border-color: rgba(124,58,237,.43);
}
.gc-card.gc-selected {
    border-color: #8b5cf6;
    box-shadow: 0 0 0 1px rgba(139,92,246,.42), 0 18px 40px rgba(0,0,0,.32);
}
.gc-card-header {
    height: 43px;
    flex: 0 0 43px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border, rgba(148,163,184,.12));
    cursor: grab;
    user-select: none;
}
.gc-card-header:active { cursor: grabbing; }
.gc-file-dot {
    height: 9px;
    width: 9px;
    border-radius: 50%;
    background: #64748b;
    flex: 0 0 auto;
}
.gc-status-added .gc-file-dot { background: #22c55e; }
.gc-status-modified .gc-file-dot { background: #f59e0b; }
.gc-status-deleted .gc-file-dot { background: #ef4444; }
.gc-status-renamed .gc-file-dot { background: #60a5fa; }
.gc-status-copied .gc-file-dot { background: #a78bfa; }
.gc-file-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-primary, #e2e8f0);
    font-size: 12px;
    font-weight: 600;
}
.gc-badge {
    font-size: 10px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--text-muted, #94a3b8);
}
.gc-status-added .gc-badge { color: #22c55e; }
.gc-status-modified .gc-badge { color: #f59e0b; }
.gc-status-deleted .gc-badge { color: #ef4444; }
.gc-status-renamed .gc-badge { color: #60a5fa; }
.gc-card-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.gc-card-path {
    flex: 0 0 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 9px 12px 7px;
    color: var(--text-muted, #64748b);
    font-size: 10px;
    font-family: "JetBrains Mono", monospace;
}
.gc-preview {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 8px 12px 12px;
    overflow: hidden;
    white-space: pre;
    color: #aeb9ce;
    font: 11px/1.55 "JetBrains Mono", monospace;
}
.gc-card-load {
    flex: 1;
    display: grid;
    place-items: center;
}
.gc-card-load button {
    color: var(--text-muted, #94a3b8);
    background: transparent;
    border: 1px solid rgba(148,163,184,.15);
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
}
.gc-card-load button:hover {
    color: #e2e8f0;
    border-color: rgba(139,92,246,.55);
}
.gc-context {
    position: fixed;
    z-index: 10020;
    min-width: 216px;
    padding: 6px;
    border-radius: 12px;
    border: 1px solid rgba(148,163,184,.17);
    background: #111727;
    box-shadow: 0 20px 48px rgba(0,0,0,.50);
}
.gc-context button {
    display: flex;
    width: 100%;
    gap: 10px;
    align-items: center;
    padding: 9px 11px;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #d8e0ed;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
}
.gc-context button:hover {
    background: rgba(124,58,237,.18);
}
.gc-context hr {
    border: 0;
    border-top: 1px solid rgba(148,163,184,.13);
    margin: 5px 2px;
}
.gc-modal {
    position: fixed;
    inset: 0;
    z-index: 10010;
    display: flex;
    flex-direction: column;
    background: rgba(5,7,14,.84);
    backdrop-filter: blur(9px);
}
.gc-modal-box {
    margin: 28px;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #0d1220;
    border: 1px solid rgba(148,163,184,.17);
    border-radius: 17px;
    box-shadow: 0 26px 70px rgba(0,0,0,.42);
    overflow: hidden;
}
.gc-modal-header {
    min-height: 57px;
    flex: 0 0 auto;
    padding: 0 18px;
    border-bottom: 1px solid rgba(148,163,184,.13);
    display: flex;
    align-items: center;
    gap: 14px;
}
.gc-modal-title {
    flex: 1;
    min-width: 0;
}
.gc-modal-title strong {
    display: block;
    font-size: 14px;
    color: #e2e8f0;
}
.gc-modal-title span {
    display: block;
    font: 11px/1.35 "JetBrains Mono", monospace;
    color: #7f8da4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.gc-close {
    height: 34px;
    width: 34px;
    border-radius: 9px;
    border: 1px solid rgba(148,163,184,.16);
    background: transparent;
    color: #cbd5e1;
    cursor: pointer;
    font-size: 18px;
}
.gc-code {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 18px 20px;
    color: #c3ccda;
    font: 12px/1.62 "JetBrains Mono", monospace;
    white-space: pre;
    tab-size: 4;
}
.gc-history-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
}
.gc-history-grid {
    display: grid;
    width: max-content;
    min-width: 100%;
    align-items: stretch;
}
.gc-history-corner,
.gc-history-head {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 78px;
    padding: 13px 14px;
    box-sizing: border-box;
    border-right: 1px solid rgba(148,163,184,.12);
    border-bottom: 1px solid rgba(148,163,184,.14);
    background: #111827;
}
.gc-history-corner {
    left: 0;
    z-index: 6;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
}
.gc-history-head strong {
    display: block;
    font: 600 12px/1.3 "JetBrains Mono", monospace;
    color: #e2e8f0;
}
.gc-history-head span,
.gc-history-head small {
    display: block;
    color: #7f8da4;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.gc-history-file {
    position: sticky;
    left: 0;
    z-index: 2;
    padding: 14px;
    border-right: 1px solid rgba(148,163,184,.12);
    border-bottom: 1px solid rgba(148,163,184,.12);
    background: #101624;
    color: #e2e8f0;
    font-size: 12px;
    min-height: 226px;
    box-sizing: border-box;
}
.gc-history-file span {
    display: block;
    margin-top: 6px;
    color: #718198;
    font: 10px/1.45 "JetBrains Mono", monospace;
    word-break: break-word;
}
.gc-history-cell {
    position: relative;
    height: 226px;
    border-right: 1px solid rgba(148,163,184,.10);
    border-bottom: 1px solid rgba(148,163,184,.12);
    background: #0d1321;
    overflow: hidden;
}
.gc-history-cell pre {
    height: 100%;
    margin: 0;
    padding: 12px;
    box-sizing: border-box;
    overflow: auto;
    color: #aab7cb;
    font: 10.5px/1.52 "JetBrains Mono", monospace;
    white-space: pre;
}
.gc-history-message {
    padding: 18px 14px;
    color: #78889d;
    font-size: 12px;
}
.gc-history-loading {
    display: grid;
    place-items: center;
    height: 100%;
    color: #78889d;
    font-size: 11px;
}
.gc-timeline-item {
    display: block;
    width: calc(100% - 12px);
    margin: 4px 6px;
    padding: 9px 9px;
    border: 0;
    border-radius: 9px;
    text-align: left;
    color: var(--text-secondary, #bac6d8);
    background: transparent;
    cursor: pointer;
}
.gc-timeline-item:hover { background: rgba(124,58,237,.12); }
.gc-timeline-item.active { background: rgba(124,58,237,.21); }
.gc-timeline-item strong {
    display: block;
    font: 11px/1.3 "JetBrains Mono", monospace;
    color: #cbd5e1;
}
.gc-timeline-item span {
    display: block;
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #8492a8;
    font-size: 11px;
}
.gc-toast {
    position: fixed;
    right: 22px;
    bottom: 24px;
    z-index: 11000;
    max-width: 420px;
    padding: 11px 14px;
    border-radius: 10px;
    border: 1px solid rgba(124,58,237,.35);
    background: #12182a;
    color: #dae3f1;
    font-size: 12px;
    box-shadow: 0 15px 38px rgba(0,0,0,.32);
}
.gc-toast-error {
    border-color: rgba(239,68,68,.45);
}
.gc-spinner {
    display: inline-block;
    height: 12px;
    width: 12px;
    border: 2px solid rgba(148,163,184,.30);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: gc-spin .7s linear infinite;
    vertical-align: -2px;
    margin-right: 7px;
}
@keyframes gc-spin { to { transform: rotate(360deg); } }
`;
    document.head.appendChild(styleNode);
}

function applyTransform(): void {
    if (!roots) return;

    roots.canvas.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.zoom})`;

    const percent = `${Math.round(state.transform.zoom * 100)}%`;
    if (roots.zoomValue) roots.zoomValue.textContent = percent;
    if (roots.stickyZoomValue) roots.stickyZoomValue.textContent = percent;
    if (roots.zoomSlider) roots.zoomSlider.value = String(state.transform.zoom);
    if (roots.stickyZoomSlider) roots.stickyZoomSlider.value = String(state.transform.zoom);
}

function resetView(): void {
    state.transform = { x: 48, y: 42, zoom: 1 };
    applyTransform();
}

function fitAll(): void {
    if (!roots || state.files.length === 0) {
        resetView();
        return;
    }

    const visiblePaths = visibleFiles().map(file => file.path);
    const positions = visiblePaths
        .map(path => state.positions.get(path))
        .filter((position): position is CardPosition => Boolean(position));

    if (positions.length === 0) {
        resetView();
        return;
    }

    const minX = Math.min(...positions.map(position => position.x));
    const minY = Math.min(...positions.map(position => position.y));
    const maxX = Math.max(...positions.map(position => position.x + position.width));
    const maxY = Math.max(...positions.map(position => position.y + position.height));

    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const viewportWidth = roots.viewport.clientWidth;
    const viewportHeight = roots.viewport.clientHeight;
    const margin = 52;

    const zoom = clamp(
        Math.min(
            (viewportWidth - margin * 2) / contentWidth,
            (viewportHeight - margin * 2) / contentHeight,
        ),
        0.18,
        1.4,
    );

    state.transform.zoom = zoom;
    state.transform.x = margin - minX * zoom;
    state.transform.y = margin - minY * zoom;
    applyTransform();
}

function zoomAt(clientX: number, clientY: number, factor: number): void {
    if (!roots) return;

    const rect = roots.viewport.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const oldZoom = state.transform.zoom;
    const nextZoom = clamp(oldZoom * factor, 0.15, 3);
    const worldX = (pointerX - state.transform.x) / oldZoom;
    const worldY = (pointerY - state.transform.y) / oldZoom;

    state.transform.zoom = nextZoom;
    state.transform.x = pointerX - worldX * nextZoom;
    state.transform.y = pointerY - worldY * nextZoom;

    applyTransform();
}

function visibleFiles(): FileRecord[] {
    return state.files.filter(file => !state.hidden.has(file.path));
}

function arrangeGrid(paths?: string[]): void {
    const targetPaths = paths?.length ? paths : visibleFiles().map(file => file.path);
    if (targetPaths.length === 0) return;

    const width = roots?.viewport.clientWidth || window.innerWidth;
    const cols = Math.max(1, Math.floor((width / Math.max(state.transform.zoom, 0.4) - 56) / (CARD_WIDTH + CARD_GAP)));

    targetPaths.forEach((path, index) => {
        const current = state.positions.get(path);
        state.positions.set(path, {
            x: (index % cols) * (CARD_WIDTH + CARD_GAP),
            y: Math.floor(index / cols) * (CARD_HEIGHT + CARD_GAP),
            width: current?.width || CARD_WIDTH,
            height: current?.height || CARD_HEIGHT,
        });
    });

    savePositions();
    renderCards();
}

function arrangeRow(paths: string[]): void {
    paths.forEach((path, index) => {
        const current = state.positions.get(path);
        state.positions.set(path, {
            x: index * (CARD_WIDTH + CARD_GAP),
            y: 0,
            width: current?.width || CARD_WIDTH,
            height: current?.height || CARD_HEIGHT,
        });
    });
    savePositions();
    renderCards();
}

function arrangeColumn(paths: string[]): void {
    paths.forEach((path, index) => {
        const current = state.positions.get(path);
        state.positions.set(path, {
            x: 0,
            y: index * (CARD_HEIGHT + CARD_GAP),
            width: current?.width || CARD_WIDTH,
            height: current?.height || CARD_HEIGHT,
        });
    });
    savePositions();
    renderCards();
}

function selectedPaths(): string[] {
    return Array.from(state.selected);
}

function clearSelection(): void {
    state.selected.clear();
    renderSelection();
}

function selectOnly(path: string): void {
    state.selected.clear();
    state.selected.add(path);
    renderSelection();
}

function toggleSelected(path: string): void {
    if (state.selected.has(path)) {
        state.selected.delete(path);
    } else {
        state.selected.add(path);
    }
    renderSelection();
}

function renderSelection(): void {
    if (!roots) return;

    roots.canvas.querySelectorAll<HTMLElement>('.gc-card').forEach(card => {
        const path = card.dataset.path || '';
        card.classList.toggle('gc-selected', state.selected.has(path));
    });

    const toolbar = byId<HTMLElement>('arrangeToolbar');
    if (toolbar) toolbar.style.display = state.selected.size > 0 ? 'flex' : 'none';
}

function setCurrentCommitLabel(): void {
    if (!roots?.currentCommitInfo) return;

    if (!state.repo) {
        roots.currentCommitInfo.innerHTML = `<span class="commit-hash-label">No repository selected</span>`;
        return;
    }

    if (state.ref === WORKING_REF) {
        roots.currentCommitInfo.innerHTML =
            `<span class="commit-hash-label">${escapeHtml(state.repo.name)}</span>` +
            `<span style="margin-left:10px;color:var(--text-muted);font-size:12px;">Working tree</span>`;
        return;
    }

    const commit = state.commits.find(item => item.hash === state.ref);
    roots.currentCommitInfo.innerHTML =
        `<span class="commit-hash-label">${escapeHtml(commit?.shortHash || state.ref.slice(0, 7))}</span>` +
        `<span style="margin-left:10px;color:var(--text-muted);font-size:12px;">${escapeHtml(commit?.message || '')}</span>`;
}

function renderTimeline(): void {
    if (!roots?.timeline) return;

    if (roots.commitCount) roots.commitCount.textContent = String(state.commits.length);

    const current = `
        <button type="button" class="gc-timeline-item ${state.ref === WORKING_REF ? 'active' : ''}" data-ref="${WORKING_REF}">
            <strong>Working tree</strong>
            <span>Current files</span>
        </button>
    `;

    const commits = state.commits.map(commit => `
        <button type="button" class="gc-timeline-item ${state.ref === commit.hash ? 'active' : ''}" data-ref="${escapeHtml(commit.hash)}">
            <strong>${escapeHtml(commit.shortHash)} · ${escapeHtml(shortDate(commit.date))}</strong>
            <span>${escapeHtml(commit.message)}</span>
        </button>
    `).join('');

    roots.timeline.innerHTML = current + commits;

    roots.timeline.querySelectorAll<HTMLButtonElement>('[data-ref]').forEach(button => {
        listen(button, 'click', () => {
            const ref = button.dataset.ref as Ref;
            if (ref !== state.ref) void loadView(ref);
        });
    });
}

function renderRepoOptions(): void {
    const select = roots?.repoSelect;
    if (!select) return;

    const options: string[] = [
        `<option value="">Select a repository...</option>`,
        ...state.repos.map(repository => (
            `<option value="${escapeHtml(repository.path)}">${escapeHtml(repository.name)}</option>`
        )),
        `<option value="__new__">＋ Open local repository...</option>`,
    ];

    select.innerHTML = options.join('');
    select.value = state.repo?.path || '';
}

function previewText(content: string): string {
    const lines = content.split('\n');
    if (lines.length <= MAX_PREVIEW_LINES) return content;
    return `${lines.slice(0, MAX_PREVIEW_LINES).join('\n')}\n…`;
}

function renderCard(file: FileRecord): HTMLElement {
    const position = state.positions.get(file.path) || {
        x: 0,
        y: 0,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
    };

    const node = document.createElement('article');
    node.className = `gc-card ${statusClass(file.status)} ${state.selected.has(file.path) ? 'gc-selected' : ''}`;
    node.dataset.path = file.path;
    node.style.left = `${position.x}px`;
    node.style.top = `${position.y}px`;
    node.style.width = `${position.width}px`;
    node.style.height = `${position.height}px`;

    const body = file.content != null
        ? `<pre class="gc-preview">${escapeHtml(previewText(file.content))}</pre>`
        : file.contentError
            ? `<div class="gc-card-load"><button type="button" data-load-content>Unable to preview · retry</button></div>`
            : `<div class="gc-card-load"><button type="button" data-load-content>Load preview</button></div>`;

    node.innerHTML = `
        <header class="gc-card-header">
            <span class="gc-file-dot"></span>
            <span class="gc-file-name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
            <span class="gc-badge">${escapeHtml(file.status)}</span>
        </header>
        <div class="gc-card-body">
            <div class="gc-card-path" title="${escapeHtml(file.path)}">${escapeHtml(dirname(file.path))}</div>
            ${body}
        </div>
    `;

    const header = node.querySelector('.gc-card-header') as HTMLElement;
    bindCardDrag(node, header, file.path);

    listen(node, 'click', ((event: MouseEvent) => {
        if ((event.target as Element).closest('button')) return;
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            toggleSelected(file.path);
        } else {
            selectOnly(file.path);
        }
    }) as EventListener);

    listen(node, 'dblclick', (() => {
        void openPreviewModal(file);
    }) as EventListener);

    listen(node, 'contextmenu', ((event: MouseEvent) => {
        event.preventDefault();

        if (!state.selected.has(file.path)) {
            selectOnly(file.path);
        }

        openContextMenu(event.clientX, event.clientY, file);
    }) as EventListener);

    const loadButton = node.querySelector<HTMLButtonElement>('[data-load-content]');
    if (loadButton) {
        listen(loadButton, 'click', ((event: MouseEvent) => {
            event.stopPropagation();
            void loadCardPreview(file.path);
        }) as EventListener);
    }

    return node;
}

function renderCards(): void {
    if (!roots) return;

    roots.canvas.innerHTML = '';

    const files = visibleFiles();

    if (roots.fileCount) roots.fileCount.textContent = String(files.length);

    if (!state.repo) {
        roots.canvas.innerHTML = `
            <div class="gc-empty">
                <strong>Choose a repository</strong>
                Use the selector on the left or import a GitHub repository.
            </div>
        `;
        return;
    }

    if (state.loading) {
        roots.canvas.innerHTML = `
            <div class="gc-empty">
                <strong><span class="gc-spinner"></span>Loading ${escapeHtml(state.repo.name)}</strong>
                Reading the repository view.
            </div>
        `;
        return;
    }

    if (files.length === 0) {
        roots.canvas.innerHTML = `
            <div class="gc-empty">
                <strong>No files in this view</strong>
                ${state.partialView
                    ? 'The compatibility fallback exposes changed files only. Implement /api/repo/view for the complete repository canvas.'
                    : 'This repository/ref returned no displayable files.'}
            </div>
        `;
        return;
    }

    if (state.positions.size === 0 || files.some(file => !state.positions.has(file.path))) {
        const currentPaths = files.map(file => file.path);
        const missing = currentPaths.filter(path => !state.positions.has(path));
        if (state.positions.size === 0) {
            const width = roots.viewport.clientWidth || window.innerWidth;
            const cols = Math.max(1, Math.floor((width - 80) / (CARD_WIDTH + CARD_GAP)));
            currentPaths.forEach((path, index) => {
                state.positions.set(path, {
                    x: (index % cols) * (CARD_WIDTH + CARD_GAP),
                    y: Math.floor(index / cols) * (CARD_HEIGHT + CARD_GAP),
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                });
            });
        } else {
            const offset = state.positions.size;
            missing.forEach((path, index) => {
                const item = offset + index;
                state.positions.set(path, {
                    x: (item % 3) * (CARD_WIDTH + CARD_GAP),
                    y: Math.floor(item / 3) * (CARD_HEIGHT + CARD_GAP),
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                });
            });
        }
        savePositions();
    }

    const fragment = document.createDocumentFragment();
    files.forEach(file => fragment.appendChild(renderCard(file)));
    roots.canvas.appendChild(fragment);
    renderSelection();
}

function bindCardDrag(node: HTMLElement, handle: HTMLElement, path: string): void {
    let pointerId: number | null = null;
    let originX = 0;
    let originY = 0;
    let startX = 0;
    let startY = 0;
    let moved = false;

    listen(handle, 'pointerdown', ((event: PointerEvent) => {
        if (event.button !== 0) return;
        event.stopPropagation();

        const position = state.positions.get(path);
        if (!position) return;

        pointerId = event.pointerId;
        originX = event.clientX;
        originY = event.clientY;
        startX = position.x;
        startY = position.y;
        moved = false;
        handle.setPointerCapture(pointerId);
    }) as EventListener);

    listen(handle, 'pointermove', ((event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;

        const deltaX = (event.clientX - originX) / state.transform.zoom;
        const deltaY = (event.clientY - originY) / state.transform.zoom;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 2) moved = true;

        const position = state.positions.get(path);
        if (!position) return;

        position.x = startX + deltaX;
        position.y = startY + deltaY;
        node.style.left = `${position.x}px`;
        node.style.top = `${position.y}px`;
    }) as EventListener);

    const release = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        try {
            handle.releasePointerCapture(pointerId);
        } catch {
            // Capture may already be released by the browser.
        }
        pointerId = null;
        if (moved) savePositions();
    };

    listen(handle, 'pointerup', release as EventListener);
    listen(handle, 'pointercancel', release as EventListener);
}

async function fetchFileContent(filePath: string, ref: Ref, signal?: AbortSignal): Promise<{ content: string; truncated: boolean }> {
    if (!state.repo) throw new Error('No repository loaded.');

    const result = await postJson<{ content: string; truncated?: boolean }>(
        '/api/repo/file-content',
        {
            path: state.repo.path,
            commit: ref,
            filePath,
        },
        signal,
    );

    return {
        content: typeof result.content === 'string' ? result.content : '',
        truncated: result.truncated === true,
    };
}

async function loadCardPreview(path: string): Promise<void> {
    const file = state.files.find(item => item.path === path);
    if (!file || !state.repo) return;

    try {
        const result = await fetchFileContent(path, state.ref);
        file.content = result.content;
        file.lines = result.content.split('\n').length;
        file.contentError = null;
    } catch (error) {
        file.contentError = errorText(error);
        toast(`Cannot load ${file.name}: ${file.contentError}`, 'error');
    }

    renderCards();
}

function closePreviewModal(): void {
    previewModalNode?.remove();
    previewModalNode = null;
}

async function openPreviewModal(file: FileRecord): Promise<void> {
    closePreviewModal();

    const modal = document.createElement('section');
    modal.className = 'gc-modal';
    modal.innerHTML = `
        <div class="gc-modal-box">
            <header class="gc-modal-header">
                <div class="gc-modal-title">
                    <strong>${escapeHtml(file.name)}</strong>
                    <span>${escapeHtml(file.path)}</span>
                </div>
                <button type="button" class="gc-close" data-close aria-label="Close">×</button>
            </header>
            <div class="gc-history-loading"><span><span class="gc-spinner"></span>Loading file…</span></div>
        </div>
    `;
    document.body.appendChild(modal);
    previewModalNode = modal;

    modal.querySelector('[data-close]')?.addEventListener('click', closePreviewModal);
    modal.addEventListener('mousedown', event => {
        if (event.target === modal) closePreviewModal();
    });

    try {
        const result = file.content != null
            ? { content: file.content, truncated: false }
            : await fetchFileContent(file.path, state.ref);

        if (previewModalNode !== modal) return;

        const box = modal.querySelector('.gc-modal-box') as HTMLElement;
        const loading = box.querySelector('.gc-history-loading');
        loading?.remove();

        const pre = document.createElement('pre');
        pre.className = 'gc-code';
        pre.textContent = result.content + (result.truncated ? '\n\n— Display truncated —' : '');
        box.appendChild(pre);
    } catch (error) {
        const loading = modal.querySelector('.gc-history-loading') as HTMLElement | null;
        if (loading) loading.textContent = `Unable to load file: ${errorText(error)}`;
    }
}

function closeContextMenu(): void {
    menuNode?.remove();
    menuNode = null;
}

function openContextMenu(x: number, y: number, clickedFile: FileRecord): void {
    closeContextMenu();

    const paths = state.selected.has(clickedFile.path) && state.selected.size > 0
        ? selectedPaths()
        : [clickedFile.path];

    const menu = document.createElement('div');
    menu.className = 'gc-context';
    menu.innerHTML = `
        <button type="button" data-action="open">Open file</button>
        <button type="button" data-action="history">History${paths.length > 1 ? ` (${paths.length} files)` : ''}</button>
        <hr />
        <button type="button" data-action="row">Arrange selected in row</button>
        <button type="button" data-action="copy">Copy path${paths.length > 1 ? 's' : ''}</button>
        <button type="button" data-action="hide">Hide from canvas</button>
    `;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);
    menuNode = menu;

    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
            menu.style.left = `${window.innerWidth - rect.width - 8}px`;
        }
        if (rect.bottom > window.innerHeight - 8) {
            menu.style.top = `${window.innerHeight - rect.height - 8}px`;
        }
    });

    menu.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            closeContextMenu();

            if (action === 'open') {
                void openPreviewModal(clickedFile);
            } else if (action === 'history') {
                void openHistoryComparison(paths);
            } else if (action === 'row') {
                arrangeRow(paths);
            } else if (action === 'copy') {
                void navigator.clipboard.writeText(paths.join('\n'))
                    .then(() => toast(paths.length === 1 ? 'Path copied.' : 'Paths copied.'))
                    .catch(() => toast('Clipboard access was denied.', 'error'));
            } else if (action === 'hide') {
                paths.forEach(path => state.hidden.add(path));
                state.selected.clear();
                renderCards();
            }
        });
    });
}

function closeHistoryModal(): void {
    historyModalNode?.remove();
    historyModalNode = null;
}

async function runWithConcurrency<T>(
    jobs: Array<() => Promise<T>>,
    limit: number,
): Promise<T[]> {
    const results = new Array<T>(jobs.length);
    let next = 0;

    async function worker(): Promise<void> {
        while (true) {
            const index = next++;
            if (index >= jobs.length) return;
            results[index] = await jobs[index]();
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limit, jobs.length) }, () => worker()),
    );

    return results;
}

async function openHistoryComparison(paths: string[]): Promise<void> {
    if (!state.repo) return;

    closeHistoryModal();

    const modal = document.createElement('section');
    modal.className = 'gc-modal';
    modal.innerHTML = `
        <div class="gc-modal-box">
            <header class="gc-modal-header">
                <div class="gc-modal-title">
                    <strong>File history comparison</strong>
                    <span>${escapeHtml(paths.length === 1 ? paths[0] : `${paths.length} selected files`)}</span>
                </div>
                <button type="button" class="gc-close" data-close aria-label="Close">×</button>
            </header>
            <div class="gc-history-loading"><span><span class="gc-spinner"></span>Loading commit histories…</span></div>
        </div>
    `;

    document.body.appendChild(modal);
    historyModalNode = modal;

    modal.querySelector('[data-close]')?.addEventListener('click', closeHistoryModal);
    modal.addEventListener('mousedown', event => {
        if (event.target === modal) closeHistoryModal();
    });

    try {
        const histories = await Promise.all(
            paths.map(path => postJson<{ commits?: any[] }>(
                '/api/repo/file-history',
                {
                    path: state.repo!.path,
                    filePath: path,
                    limit: HISTORY_COMMIT_LIMIT,
                },
            )),
        );

        if (historyModalNode !== modal) return;

        const commitsByHash = new Map<string, Commit>();
        histories.forEach(history => {
            (history.commits || []).forEach(raw => {
                const commit = normalizedCommit(raw);
                if (commit.hash) commitsByHash.set(commit.hash, commit);
            });
        });

        const commits = Array.from(commitsByHash.values())
            .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
            .slice(0, HISTORY_COMMIT_LIMIT);

        const columns: HistoryColumn[] = [
            {
                ref: WORKING_REF,
                title: 'Current',
                subtitle: 'Working tree',
                date: '',
            },
            ...commits.map(commit => ({
                ref: commit.hash,
                title: commit.shortHash,
                subtitle: commit.message,
                date: shortDate(commit.date),
            })),
        ];

        const box = modal.querySelector('.gc-modal-box') as HTMLElement;
        box.querySelector('.gc-history-loading')?.remove();

        const scroll = document.createElement('div');
        scroll.className = 'gc-history-scroll';

        const grid = document.createElement('div');
        grid.className = 'gc-history-grid';
        grid.style.gridTemplateColumns = `252px repeat(${columns.length}, 350px)`;

        grid.innerHTML = `
            <div class="gc-history-corner">Files × snapshots</div>
            ${columns.map(column => `
                <div class="gc-history-head">
                    <strong>${escapeHtml(column.title)}</strong>
                    <span>${escapeHtml(column.subtitle)}</span>
                    <small>${escapeHtml(column.date)}</small>
                </div>
            `).join('')}
            ${paths.map(path => `
                <div class="gc-history-file">
                    ${escapeHtml(filename(path))}
                    <span>${escapeHtml(path)}</span>
                </div>
                ${columns.map(column => `
                    <div class="gc-history-cell" data-cell-path="${escapeHtml(path)}" data-cell-ref="${escapeHtml(column.ref)}">
                        <div class="gc-history-loading">Loading…</div>
                    </div>
                `).join('')}
            `).join('')}
        `;

        scroll.appendChild(grid);
        box.appendChild(scroll);

        const cells = new Map<string, HistoryCell>();
        const jobs: Array<() => Promise<void>> = [];

        paths.forEach(path => {
            columns.forEach(column => {
                const key = `${path}\u0000${column.ref}`;
                cells.set(key, {
                    loading: true,
                    content: null,
                    error: null,
                    truncated: false,
                });

                jobs.push(async () => {
                    const cell = cells.get(key)!;
                    try {
                        const result = await fetchFileContent(path, column.ref);
                        cell.content = result.content;
                        cell.truncated = result.truncated;
                    } catch (error) {
                        cell.error = errorText(error);
                    } finally {
                        cell.loading = false;
                    }

                    if (historyModalNode !== modal) return;

                    const target = Array.from(
                        grid.querySelectorAll<HTMLElement>('.gc-history-cell'),
                    ).find(element => (
                        element.dataset.cellPath === path &&
                        element.dataset.cellRef === column.ref
                    ));

                    if (!target) return;

                    if (cell.error) {
                        target.innerHTML = `<div class="gc-history-message">Not available in this snapshot.<br />${escapeHtml(cell.error)}</div>`;
                    } else {
                        const pre = document.createElement('pre');
                        pre.textContent = (cell.content || '') + (cell.truncated ? '\n\n— Display truncated —' : '');
                        target.replaceChildren(pre);
                    }
                });
            });
        });

        await runWithConcurrency(jobs, 5);
    } catch (error) {
        const loading = modal.querySelector('.gc-history-loading') as HTMLElement | null;
        if (loading) {
            loading.textContent = `Unable to load history: ${errorText(error)}`;
        }
    }
}

async function fetchView(repoPath: string, ref: Ref, signal: AbortSignal): Promise<ViewResponse> {
    try {
        const result = await postJson<any>(
            '/api/repo/view',
            { path: repoPath, ref },
            signal,
        );

        const files = Array.isArray(result.files)
            ? result.files.map(normalizedFile).filter(Boolean) as FileRecord[]
            : [];
        const commits = Array.isArray(result.commits)
            ? result.commits.map(normalizedCommit)
            : [];

        return {
            files,
            commits,
            totalFiles: typeof result.totalFiles === 'number' ? result.totalFiles : files.length,
            partial: false,
        };
    } catch (error) {
        if ((error as any)?.status !== 404) throw error;

        /*
         * This is intentionally a short-lived bridge for the uploaded project:
         * /api/repo/files exists already but exposes changed files rather than
         * the complete repository canvas.
         */
        const result = await postJson<any>(
            '/api/repo/files',
            { path: repoPath, commit: ref },
            signal,
        );

        const files = Array.isArray(result.files)
            ? result.files.map(normalizedFile).filter(Boolean) as FileRecord[]
            : [];

        return {
            files,
            commits: state.commits,
            totalFiles: files.length,
            partial: true,
        };
    }
}

async function loadView(ref: Ref): Promise<void> {
    if (!state.repo || !roots) return;

    state.activeAbort?.abort();
    const controller = new AbortController();
    state.activeAbort = controller;

    const sequence = ++state.loadSequence;
    state.loading = true;
    state.ref = ref;
    state.selected.clear();
    state.hidden.clear();
    loadPositions();

    setCurrentCommitLabel();
    renderTimeline();
    renderCards();
    showStatus(`Loading ${state.repo.name}…`, 'loading');

    try {
        const view = await fetchView(state.repo.path, ref, controller.signal);

        if (state.disposed || sequence !== state.loadSequence) return;

        state.files = view.files;
        state.partialView = view.partial === true;

        if (view.commits.length > 0 || state.commits.length === 0) {
            state.commits = view.commits;
        }

        state.loading = false;
        renderTimeline();
        setCurrentCommitLabel();
        renderCards();

        if (state.partialView) {
            showStatus(
                'Showing changed files only. Add /api/repo/view to enable the complete repository canvas.',
                'neutral',
            );
        } else {
            hideStatus();
        }

        if (state.files.length > 0) {
            fitAll();
        }
    } catch (error) {
        if (controller.signal.aborted || state.disposed || sequence !== state.loadSequence) return;

        state.loading = false;
        state.files = [];
        renderCards();
        showStatus(`Failed to open repository: ${errorText(error)}`, 'error');
        toast(`Repository load failed: ${errorText(error)}`, 'error');
    }
}

async function openRepository(repository: Repository): Promise<void> {
    state.repo = repository;
    state.ref = WORKING_REF;
    state.commits = [];
    state.files = [];
    state.selected.clear();
    state.hidden.clear();
    state.positions.clear();

    persistRepository();

    if (roots?.repoPath) roots.repoPath.value = repository.path;
    if (roots?.repoSelect) roots.repoSelect.value = repository.path;

    resetView();
    await loadView(WORKING_REF);
}

async function discoverRepositories(): Promise<void> {
    showStatus('Discovering repositories…', 'loading');

    try {
        const result = await requestJson<any>('/api/repo/list');
        const repositories = Array.isArray(result.repos)
            ? result.repos.map(normalizedRepo).filter(Boolean) as Repository[]
            : [];

        const defaultRepository = normalizedRepo(result.defaultRepo || result.defaultPath || result.repoPath);
        const rememberedPath = storedRepository();
        const remembered = rememberedPath ? normalizedRepo(rememberedPath) : null;

        const unique = new Map<string, Repository>();
        [...repositories, ...(defaultRepository ? [defaultRepository] : []), ...(remembered ? [remembered] : [])]
            .forEach(repository => unique.set(repository.path, repository));

        state.repos = Array.from(unique.values());
        renderRepoOptions();

        const initial =
            defaultRepository ||
            (rememberedPath ? state.repos.find(repository => repository.path === rememberedPath) || null : null) ||
            (state.repos.length === 1 ? state.repos[0] : null);

        if (initial) {
            await openRepository(initial);
        } else if (state.repos.length === 0) {
            showStatus('No repositories found. Import one from GitHub or open a local path.', 'neutral');
            renderCards();
        } else {
            showStatus('Select a repository to begin.', 'neutral');
            renderCards();
        }
    } catch (error) {
        showStatus(`Repository discovery failed: ${errorText(error)}`, 'error');
        toast('The repository list endpoint is not available.', 'error');
        renderCards();
    }
}

function addRepository(repository: Repository): void {
    const existing = state.repos.find(item => item.path === repository.path);
    if (!existing) state.repos.unshift(repository);
    renderRepoOptions();
}

async function cloneRepository(url: string): Promise<void> {
    const response = await fetch('/api/repo/clone-stream', {
        method: 'POST',
        headers: {
            Accept: 'text/event-stream, application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        const result = await response.json();
        if (!response.ok || !result.path) throw new Error(result.error || 'Clone failed.');
        const repository = { path: result.path, name: repoName(result.path) };
        addRepository(repository);
        await openRepository(repository);
        return;
    }

    if (!response.body) throw new Error('Clone stream was not returned.');

    showStatus('Cloning repository…', 'loading');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const part = await reader.read();
        if (part.done) break;

        buffer += decoder.decode(part.value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const message of messages) {
            const event = message.match(/^event:\s*(.+)$/m)?.[1]?.trim();
            const dataText = message.match(/^data:\s*(.+)$/m)?.[1]?.trim();
            if (!dataText) continue;

            const data = JSON.parse(dataText);

            if (event === 'progress') {
                showStatus(data.message || 'Cloning repository…', 'loading');
            } else if (event === 'error') {
                throw new Error(data.error || 'Clone failed.');
            } else if (event === 'done') {
                const repository = { path: data.path, name: repoName(data.path) };
                addRepository(repository);
                await openRepository(repository);
                toast(`Opened ${repository.name}.`);
                return;
            }
        }
    }

    throw new Error('Clone completed without returning a repository path.');
}

function bindRepositoryControls(): void {
    if (roots?.repoSelect) {
        listen(roots.repoSelect, 'change', (() => {
            const value = roots!.repoSelect!.value;

            if (!value) return;

            if (value === '__new__') {
                const path = window.prompt(
                    'Enter an absolute path to a Git repository.',
                    '',
                )?.trim();

                if (!path) {
                    roots!.repoSelect!.value = state.repo?.path || '';
                    return;
                }

                const repository = { path, name: repoName(path) };
                addRepository(repository);
                void openRepository(repository);
                return;
            }

            const repository = state.repos.find(item => item.path === value) || {
                path: value,
                name: repoName(value),
            };

            void openRepository(repository);
        }) as EventListener);
    }

    const githubImport = byId<HTMLButtonElement>('githubImportBtn');
    listen(githubImport, 'click', (() => {
        const url = window.prompt(
            'Paste a GitHub Git URL.',
            'https://github.com/',
        )?.trim();

        if (!url) return;

        void cloneRepository(url).catch(error => {
            showStatus(`Clone failed: ${errorText(error)}`, 'error');
            toast(`Clone failed: ${errorText(error)}`, 'error');
        });
    }) as EventListener);

    const pull = byId<HTMLButtonElement>('pullBtn');
    listen(pull, 'click', (() => {
        if (state.repo) void loadView(state.ref);
    }) as EventListener);
}

function bindCanvasControls(): void {
    if (!roots) return;

    let panPointer: number | null = null;
    let panClientX = 0;
    let panClientY = 0;
    let panStartX = 0;
    let panStartY = 0;

    listen(roots.viewport, 'pointerdown', ((event: PointerEvent) => {
        const target = event.target as Element;
        if (target.closest('.gc-card')) return;
        if (event.button !== 0 && event.button !== 1) return;

        panPointer = event.pointerId;
        panClientX = event.clientX;
        panClientY = event.clientY;
        panStartX = state.transform.x;
        panStartY = state.transform.y;
        roots!.viewport.classList.add('gc-panning');
        roots!.viewport.setPointerCapture(event.pointerId);

        if (!event.shiftKey) clearSelection();
    }) as EventListener);

    listen(roots.viewport, 'pointermove', ((event: PointerEvent) => {
        if (panPointer !== event.pointerId) return;

        state.transform.x = panStartX + event.clientX - panClientX;
        state.transform.y = panStartY + event.clientY - panClientY;
        applyTransform();
    }) as EventListener);

    const endPan = (event: PointerEvent) => {
        if (panPointer !== event.pointerId) return;
        try {
            roots!.viewport.releasePointerCapture(event.pointerId);
        } catch {
            // Browser may release capture automatically.
        }
        panPointer = null;
        roots!.viewport.classList.remove('gc-panning');
    };

    listen(roots.viewport, 'pointerup', endPan as EventListener);
    listen(roots.viewport, 'pointercancel', endPan as EventListener);

    listen(roots.viewport, 'wheel', ((event: WheelEvent) => {
        if ((event.target as Element).closest('.gc-code, .gc-history-cell pre')) return;
        event.preventDefault();
        zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.09 : 1 / 1.09);
    }) as EventListener, { passive: false });

    const reset = byId<HTMLButtonElement>('resetView');
    const fit = byId<HTMLButtonElement>('fitAll');
    const stickyFit = byId<HTMLButtonElement>('stickyFitAll');

    listen(reset, 'click', resetView as EventListener);
    listen(fit, 'click', fitAll as EventListener);
    listen(stickyFit, 'click', fitAll as EventListener);

    const zoomInput = (event: Event) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        if (!Number.isFinite(value)) return;
        state.transform.zoom = clamp(value, 0.15, 3);
        applyTransform();
    };

    listen(roots.zoomSlider, 'input', zoomInput as EventListener);
    listen(roots.stickyZoomSlider, 'input', zoomInput as EventListener);

    listen(byId('stickyZoomIn'), 'click', (() => {
        const rect = roots!.viewport.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.12);
    }) as EventListener);

    listen(byId('stickyZoomOut'), 'click', (() => {
        const rect = roots!.viewport.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.12);
    }) as EventListener);

    listen(byId('arrangeGrid'), 'click', (() => arrangeGrid(selectedPaths())) as EventListener);
    listen(byId('arrangeRow'), 'click', (() => arrangeRow(selectedPaths())) as EventListener);
    listen(byId('arrangeCol'), 'click', (() => arrangeColumn(selectedPaths())) as EventListener);
    listen(byId('arrangeFit'), 'click', fitAll as EventListener);
}

function bindKeyboard(): void {
    listen(document, 'keydown', ((event: KeyboardEvent) => {
        const target = event.target as HTMLElement;
        const typing = target.matches('input, textarea, [contenteditable="true"]');

        if (event.key === 'Escape') {
            closeContextMenu();
            if (historyModalNode) closeHistoryModal();
            else if (previewModalNode) closePreviewModal();
            else clearSelection();
            return;
        }

        if (typing) return;

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            visibleFiles().forEach(file => state.selected.add(file.path));
            renderSelection();
        } else if (event.key.toLowerCase() === 'g' && state.selected.size > 0) {
            arrangeGrid(selectedPaths());
        } else if (event.key.toLowerCase() === 'h' && state.selected.size > 0) {
            arrangeRow(selectedPaths());
        } else if (event.key.toLowerCase() === 'v' && state.selected.size > 0) {
            arrangeColumn(selectedPaths());
        } else if (event.key.toLowerCase() === 'w') {
            fitAll();
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected.size > 0) {
            selectedPaths().forEach(path => state.hidden.add(path));
            state.selected.clear();
            renderCards();
        }
    }) as EventListener);

    listen(document, 'mousedown', ((event: MouseEvent) => {
        if (menuNode && !menuNode.contains(event.target as Node)) closeContextMenu();
    }) as EventListener);
}

function teardown(): void {
    state.disposed = true;
    state.activeAbort?.abort();

    removeListeners.forEach(remove => remove());
    removeListeners = [];

    closeContextMenu();
    closePreviewModal();
    closeHistoryModal();

    styleNode?.remove();
    styleNode = null;

    document.querySelector('.gc-toast')?.remove();

    if (toastTimer !== null) {
        window.clearTimeout(toastTimer);
        toastTimer = null;
    }
}

export default function mount(): () => void {
    window.__gitmaps_cleanup__?.();
    state.disposed = false;
    state.loading = false;
    state.partialView = false;
    state.repo = null;
    state.repos = [];
    state.ref = WORKING_REF;
    state.commits = [];
    state.files = [];
    state.selected.clear();
    state.hidden.clear();
    state.positions.clear();
    state.transform = { x: 48, y: 42, zoom: 1 };

    injectStyles();

    try {
        roots = ensureCanvasRoots();
        applyTransform();
        bindRepositoryControls();
        bindCanvasControls();
        bindKeyboard();
        renderCards();
        void discoverRepositories();
    } catch (error) {
        showStatus(`Application startup failed: ${errorText(error)}`, 'error');
        toast(`Application startup failed: ${errorText(error)}`, 'error');
    }

    window.__gitmaps_cleanup__ = teardown;
    return teardown;
}
