/**
 * Status Bar — VS Code-style bottom bar for GitMaps
 *
 * Shows: zoom %, file count, selected count, repo name, canonical slug, mode.
 * Updates reactively via exported update functions.
 */

import type { CanvasContext } from './context';
import { escapeHtml, showToast } from './utils';

let bar: HTMLElement | null = null;
let ctx: CanvasContext | null = null;
let slugPopoverEl: HTMLElement | null = null;
let slugTriggerEl: HTMLElement | null = null;

// Cached state for efficient updates
let _zoom = 1;
let _fileCount = 0;
let _selectedCount = 0;
let _repoName = '';
let _repoPath = '';
let _repoSlug = '';
let _repoSlugSource = '';
let _mode = 'Simple';
let _commitHash = '';

function summarizeSlugSource(source: string): string {
    if (!source) return '';

    const [host] = source.split(' · ');
    if (host) return `via ${host}`;
    if (source.length <= 36) return source;
    return `${source.slice(0, 33)}...`;
}

function getSlugSourceDetails(source: string): { host: string; remoteUrl: string } {
    if (!source) return { host: '', remoteUrl: '' };

    const [host, remoteUrl] = source.split(' · ');
    return {
        host: remoteUrl ? host : '',
        remoteUrl: remoteUrl || source,
    };
}

function getPopoverButtons(): HTMLElement[] {
    if (!slugPopoverEl) return [];
    return Array.from(slugPopoverEl.querySelectorAll('button:not([disabled])')) as HTMLElement[];
}

function focusPopoverButton(index: number) {
    const buttons = getPopoverButtons();
    if (buttons.length === 0) return;
    const nextIndex = (index + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
}

async function copyText(text: string, successMessage: string) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(successMessage, 'success');
    } catch {
        showToast('Failed to copy to clipboard', 'error');
    }
}

async function copyCanonicalSlug(includeSource = false) {
    if (!_repoSlug) return;

    const text = includeSource && _repoSlugSource
        ? `${_repoSlug}\n${_repoSlugSource}`
        : _repoSlug;

    await copyText(
        text,
        includeSource && _repoSlugSource
            ? 'Copied canonical slug + source'
            : `Copied canonical slug: ${_repoSlug}`,
    );
}

function closeSlugPopover(restoreFocus = false) {
    slugPopoverEl?.remove();
    slugPopoverEl = null;

    if (slugTriggerEl) {
        slugTriggerEl.setAttribute('aria-expanded', 'false');
        if (restoreFocus) slugTriggerEl.focus();
    }
}

function renderSlugPopover() {
    if (!bar || !_repoSlug || !slugTriggerEl) return;

    closeSlugPopover();

    const { host, remoteUrl } = getSlugSourceDetails(_repoSlugSource);
    const safeSlug = escapeHtml(_repoSlug);
    const safeHost = escapeHtml(host || 'Local/unknown');
    const safeRemoteUrl = escapeHtml(remoteUrl || 'Not available');

    const popover = document.createElement('div');
    popover.className = 'sb-slug-popover';
    popover.id = 'sbSlugPopover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Canonical slug details');
    popover.innerHTML = `
        <div class="sb-slug-popover__header">
            <div>
                <div class="sb-slug-popover__eyebrow">Canonical route</div>
                <div class="sb-slug-popover__slug">/${safeSlug}</div>
            </div>
            <button class="sb-slug-popover__close" type="button" aria-label="Close canonical slug details">×</button>
        </div>
        <div class="sb-slug-popover__meta">
            <div class="sb-slug-popover__row">
                <span class="sb-slug-popover__label">Host</span>
                <span class="sb-slug-popover__value">${safeHost}</span>
            </div>
            <div class="sb-slug-popover__row">
                <span class="sb-slug-popover__label">Remote</span>
                <span class="sb-slug-popover__value sb-slug-popover__value--multiline">${safeRemoteUrl}</span>
            </div>
        </div>
        <div class="sb-slug-popover__actions">
            <button class="sb-slug-popover__action" type="button" data-copy="slug">Copy slug</button>
            <button class="sb-slug-popover__action" type="button" data-copy="source" ${_repoSlugSource ? '' : 'disabled'}>Copy source</button>
            <button class="sb-slug-popover__action" type="button" data-copy="both" ${_repoSlugSource ? '' : 'disabled'}>Copy both</button>
        </div>
    `;

    bar.appendChild(popover);
    slugPopoverEl = popover;
    slugTriggerEl.setAttribute('aria-expanded', 'true');

    const slugRect = slugTriggerEl.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const left = Math.max(8, Math.min(slugRect.left - barRect.left, Math.max(8, barRect.width - 360)));
    popover.style.left = `${left}px`;
    popover.style.bottom = '30px';

    popover.querySelector('.sb-slug-popover__close')?.addEventListener('click', () => {
        closeSlugPopover(true);
    });

    popover.querySelector('[data-copy="slug"]')?.addEventListener('click', () => {
        void copyText(_repoSlug, `Copied canonical slug: ${_repoSlug}`);
    });

    popover.querySelector('[data-copy="source"]')?.addEventListener('click', () => {
        if (_repoSlugSource) {
            void copyText(_repoSlugSource, 'Copied canonical slug source');
        }
    });

    popover.querySelector('[data-copy="both"]')?.addEventListener('click', () => {
        if (_repoSlugSource) {
            void copyText(`${_repoSlug}\n${_repoSlugSource}`, 'Copied canonical slug + source');
        }
    });

    popover.addEventListener('keydown', (event) => {
        const buttons = getPopoverButtons();
        if (buttons.length === 0) return;

        const activeIndex = buttons.findIndex(button => button === document.activeElement);

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            focusPopoverButton(activeIndex + 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            focusPopoverButton(activeIndex - 1);
        } else if (event.key === 'Tab') {
            event.preventDefault();
            focusPopoverButton(activeIndex + (event.shiftKey ? -1 : 1));
        }
    });

    const firstButton = getPopoverButtons()[0];
    firstButton?.focus();
}

function toggleSlugPopover() {
    if (slugPopoverEl) {
        closeSlugPopover(true);
        return;
    }
    renderSlugPopover();
}

function createBar(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'status-bar';
    el.innerHTML = `
        <div class="sb-left">
            <span class="sb-item sb-repo" id="sbRepo" title="Current repository"></span>
            <button class="sb-item sb-slug" id="sbSlug" title="Canonical remote slug" style="display:none" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="sbSlugPopover"></button>
            <span class="sb-item sb-commit" id="sbCommit" title="Current commit"></span>
        </div>
        <div class="sb-right">
            <span class="sb-item sb-mode" id="sbMode" title="Interaction mode"></span>
            <span class="sb-item sb-selected" id="sbSelected" title="Selected cards"></span>
            <span class="sb-item sb-files" id="sbFiles" title="Total files on canvas"></span>
            <span class="sb-item sb-zoom" id="sbZoom" title="Zoom level (scroll to zoom)"></span>
        </div>
    `;
    return el;
}

function render() {
    if (!bar) return;

    const repoEl = bar.querySelector('#sbRepo') as HTMLElement;
    const slugEl = bar.querySelector('#sbSlug') as HTMLButtonElement;
    const commitEl = bar.querySelector('#sbCommit') as HTMLElement;
    const modeEl = bar.querySelector('#sbMode') as HTMLElement;
    const selectedEl = bar.querySelector('#sbSelected') as HTMLElement;
    const filesEl = bar.querySelector('#sbFiles') as HTMLElement;
    const zoomEl = bar.querySelector('#sbZoom') as HTMLElement;

    if (repoEl) {
        repoEl.textContent = _repoName ? `📂 ${_repoName}` : '';
        repoEl.title = _repoPath || 'Current repository';
    }
    if (slugEl) {
        const slugSourceSummary = summarizeSlugSource(_repoSlugSource);
        slugEl.textContent = _repoSlug
            ? `↗ ${_repoSlug}${slugSourceSummary ? ` · ${slugSourceSummary}` : ''}`
            : '';
        slugEl.style.display = _repoSlug ? '' : 'none';
        slugEl.title = _repoSlug
            ? (_repoSlugSource
                ? `Canonical slug: ${_repoSlug}\nSource: ${_repoSlugSource}\nClick or press Enter/Space to inspect · Shift+Click to copy slug + source`
                : `Canonical slug: ${_repoSlug}\nClick or press Enter/Space to inspect`)
            : 'Canonical remote slug';
        slugEl.setAttribute('aria-label', _repoSlugSource
            ? `Canonical slug ${_repoSlug}. Press Enter or Space for details. Shift click copies slug and source.`
            : `Canonical slug ${_repoSlug}. Press Enter or Space for details.`);
        slugTriggerEl = slugEl;
    }
    if (commitEl) commitEl.textContent = _commitHash ? `⊙ ${_commitHash.substring(0, 7)}` : '';
    if (modeEl) {
        modeEl.textContent = `${_mode === 'Advanced' ? '🎯' : '✋'} ${_mode}`;
        modeEl.className = `sb-item sb-mode sb-mode--${_mode.toLowerCase()}`;
    }
    if (selectedEl) {
        selectedEl.textContent = _selectedCount > 0 ? `☑ ${_selectedCount} selected` : '';
        selectedEl.style.display = _selectedCount > 0 ? '' : 'none';
    }
    if (filesEl) filesEl.textContent = `📄 ${_fileCount} files`;
    if (zoomEl) zoomEl.textContent = `🔍 ${Math.round(_zoom * 100)}%`;

    if (!_repoSlug) closeSlugPopover();
}

function installGlobalSlugPopoverHandlers() {
    document.addEventListener('click', (event) => {
        if (!slugPopoverEl) return;
        const target = event.target as Node | null;
        if (!target) return;
        if (slugPopoverEl.contains(target)) return;
        if ((target as HTMLElement).closest?.('#sbSlug')) return;
        closeSlugPopover();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeSlugPopover(true);
    });
}

// ─── Public API ──────────────────────────────────────────

export function initStatusBar(context: CanvasContext) {
    ctx = context;
    bar = createBar();

    const canvasArea = document.querySelector('.canvas-area');
    if (canvasArea) {
        canvasArea.parentElement?.insertBefore(bar, canvasArea.nextSibling);
    } else {
        document.body.appendChild(bar);
    }

    const slugEl = bar.querySelector('#sbSlug') as HTMLButtonElement | null;
    slugTriggerEl = slugEl;

    slugEl?.addEventListener('click', (event) => {
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.shiftKey) {
            void copyCanonicalSlug(true);
            return;
        }
        toggleSlugPopover();
    });

    slugEl?.addEventListener('keydown', (event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
            keyboardEvent.preventDefault();
            toggleSlugPopover();
        } else if (keyboardEvent.key === 'ArrowDown' && !slugPopoverEl) {
            keyboardEvent.preventDefault();
            renderSlugPopover();
        }
    });

    installGlobalSlugPopoverHandlers();

    const state = ctx.snap().context;
    _zoom = state.zoom || 1;
    _repoPath = state.repoPath || '';
    _repoName = (_repoPath || '').split('/').pop() || '';
    _repoSlug = '';
    _repoSlugSource = '';
    _fileCount = ctx.fileCards.size;
    _mode = state.mode === 'advanced' ? 'Advanced' : 'Simple';
    _commitHash = state.currentCommitHash || '';
    render();
}

export function updateStatusBarZoom(zoom: number) {
    if (Math.round(zoom * 100) === Math.round(_zoom * 100)) return;
    _zoom = zoom;
    const el = bar?.querySelector('#sbZoom') as HTMLElement;
    if (el) el.textContent = `🔍 ${Math.round(zoom * 100)}%`;
}

export function updateStatusBarFiles(count: number) {
    _fileCount = count;
    const el = bar?.querySelector('#sbFiles') as HTMLElement;
    if (el) el.textContent = `📄 ${count} files`;
}

export function updateStatusBarSelected(count: number) {
    _selectedCount = count;
    const el = bar?.querySelector('#sbSelected') as HTMLElement;
    if (el) {
        el.textContent = count > 0 ? `☑ ${count} selected` : '';
        el.style.display = count > 0 ? '' : 'none';
    }
}

export function updateStatusBarRepo(repoPath: string, canonicalSlug = '', canonicalSource = '') {
    _repoPath = repoPath;
    _repoName = repoPath.split('/').pop() || repoPath.split('\\').pop() || '';
    _repoSlug = canonicalSlug || '';
    _repoSlugSource = canonicalSource || '';
    render();
}

export function updateStatusBarCommit(hash: string) {
    _commitHash = hash;
    const el = bar?.querySelector('#sbCommit') as HTMLElement;
    if (el) el.textContent = hash ? `⊙ ${hash.substring(0, 7)}` : '';
}

export function updateStatusBarMode(mode: string) {
    _mode = mode;
    const el = bar?.querySelector('#sbMode') as HTMLElement;
    if (el) {
        el.textContent = `${mode === 'Advanced' ? '🎯' : '✋'} ${mode}`;
        el.className = `sb-item sb-mode sb-mode--${mode.toLowerCase()}`;
    }
}
