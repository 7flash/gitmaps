// @ts-nocheck
/**
 * Card context menu — right-click menu for file cards.
 * Extracted from cards.tsx for modularity.
 */
import { render } from 'tradjs/client';
import type { CanvasContext } from './context';
import { showToast } from './utils';
import { hideSelectedFiles } from './hidden-files';
import { layerState, createLayer, moveFilesToLayer, moveFileToLayer, addFileToLayer, removeFileFromLayer, getActiveLayer } from './layers';
import { isPinned, togglePinCard } from './viewport-culling';
import { getFileActionsForPath, type FileAction } from './file-actions';

// These are imported lazily to avoid circular deps
let _updateSelectionHighlights: any;
let _updateArrangeToolbar: any;
let _openFileModal: any;
let _toggleCardExpand: any;
let _fitScreenSize: any;

function lazyLoad() {
    if (!_updateSelectionHighlights) {
        const cards = require('./cards');
        _updateSelectionHighlights = cards.updateSelectionHighlights;
        _updateArrangeToolbar = cards.updateArrangeToolbar;
        _openFileModal = cards.openFileModal;
        _toggleCardExpand = cards.toggleCardExpand;
        _fitScreenSize = cards.fitScreenSize;
    }
}

// ─── Context Menu JSX component ─────────────────────
function ContextMenu({ onAction, onActionLayer, onFileAction, onSelectFolder, isInActiveLayer, pinned, filePath, canRunScript, selectedCount, fileActions }: {
    onAction: (action: string) => void;
    onActionLayer: (layerId: string) => void;
    onFileAction: (action: FileAction) => void;
    onSelectFolder: (dir: string) => void;
    isInActiveLayer: boolean;
    pinned: boolean;
    filePath: string;
    canRunScript: boolean;
    selectedCount: number;
    fileActions: FileAction[];
}) {
    const customLayers = layerState.layers.filter(l => l.id !== 'default');

    // Build ancestor directory chain: app/lib/utils/foo.ts → ['app/lib/utils', 'app/lib', 'app']
    const parts = filePath.split('/');
    const ancestors: string[] = [];
    if (parts.length > 1) {
        for (let i = parts.length - 2; i >= 0; i--) {
            ancestors.push(parts.slice(0, i + 1).join('/'));
        }
    }

    return (
        <>
            <button type="button" className="ctx-item" onClick={() => onAction('copy-path')}>📋 Copy path</button>
            {selectedCount > 1 && (
                <button type="button" className="ctx-item" onClick={() => onAction('copy-selected-content')}>
                    📋 Copy content of {selectedCount} files
                </button>
            )}
            <button type="button" className="ctx-item" onClick={() => onAction('select')}>☑️ Select</button>
            {ancestors.length > 0 ? (
                <div className="ctx-item ctx-dropdown">
                    <span>📁 Select from folder ▸</span>
                    <div className="ctx-dropdown-content">
                        {ancestors.map(dir => (
                            <button type="button" key={dir} className="ctx-item" onClick={() => onSelectFolder(dir)}>
                                📂 {dir}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <button type="button" className="ctx-item" onClick={() => onSelectFolder('')}>📁 Select all (root)</button>
            )}
            <button type="button" className="ctx-item" onClick={() => onAction('pin')}>{pinned ? '📌 Unpin card' : '📌 Pin card'}</button>
            <div className="ctx-divider"></div>
            <button type="button" className="ctx-item" onClick={() => onAction('expand')}>📖 Open in Editor</button>
            <button type="button" className="ctx-item" onClick={() => onAction('edit')}>✏️ Edit file</button>
            <button type="button" className="ctx-item" onClick={() => onAction('blame')}>👤 Git blame</button>
            {canRunScript && (
                <>
                    <button type="button" className="ctx-item" onClick={() => onAction('run-script')}>▶ Run with bgrun</button>
                    <button type="button" className="ctx-item" onClick={() => onAction('script-output')}>📟 View script output</button>
                </>
            )}
            {fileActions.length > 0 && (
                <div className="ctx-item ctx-dropdown">
                    <span>⚙ Run file action ▸</span>
                    <div className="ctx-dropdown-content">
                        {fileActions.map(action => (
                            <button type="button" key={action.id} className="ctx-item" onClick={() => onFileAction(action)}>
                                {action.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <button type="button" className="ctx-item" onClick={() => onAction('connect')}>🔗 Connect to...</button>
            <button type="button" className="ctx-item" onClick={() => onAction('fit-content')}>📏 Fit content</button>
            <button type="button" className="ctx-item" onClick={() => onAction('fit-screen')}>📺 Fit screen</button>
            <div className="ctx-divider"></div>
            <button type="button" className="ctx-item" onClick={() => onAction('history')}>🕰️ File history</button>
            <div className="ctx-item ctx-dropdown">
                <span>📦 Move to Layer ▸</span>
                <div className="ctx-dropdown-content">
                    {customLayers.length === 0 ? (
                        <div className="ctx-item" style="opacity: 0.5; pointer-events: none">No custom layers</div>
                    ) : (
                        customLayers.map(l => (
                            <button type="button" key={l.id} className="ctx-item" onClick={() => onActionLayer(l.id)}>
                                + {l.name}
                            </button>
                        ))
                    )}
                    <div className="ctx-divider"></div>
                    <button type="button" className="ctx-item" onClick={() => onActionLayer('new')}>✨ Create New Layer</button>
                </div>
            </div>
            {isInActiveLayer && (
                <button type="button" className="ctx-item" onClick={() => onAction('remove-from-layer')} style="color: #60a5fa">
                    ↩ Move to Main
                </button>
            )}
            <div className="ctx-divider"></div>
            <button type="button" className="ctx-item" onClick={() => onAction('hide')} style="color: #f59e0b">🙈 Hide file</button>
            <button type="button" className="ctx-item" onClick={() => onAction('rename')}>✏️ Rename / Move</button>
            <button type="button" className="ctx-item" onClick={() => onAction('delete')} style="color: #ef4444">🗑️ Delete file</button>
        </>
    );
}

async function copyFilesContentToClipboard(ctx: CanvasContext, filePaths: string[]) {
    const state = ctx.snap().context;
    if (!state.repoPath) {
        showToast('Load a repository first', 'error');
        return;
    }

    try {
        const results = await Promise.all(filePaths.map(async (path) => {
            const response = await fetch('/api/repo/file-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: state.repoPath,
                    commit: state.currentCommitHash || undefined,
                    filePath: path,
                }),
            });

            if (!response.ok) {
                return {
                    path,
                    ok: false,
                    content: `<< Failed to load: ${await response.text()} >>`,
                };
            }

            const data = await response.json();
            return {
                path,
                ok: true,
                content: data.content || '',
            };
        }));

        const payload = results
            .map(({ path, content }) => `===== ${path} =====\n${content}`)
            .join('\n\n');

        await navigator.clipboard.writeText(payload);

        const failedCount = results.filter(r => !r.ok).length;
        if (failedCount > 0) {
            showToast(`Copied ${results.length} files to clipboard (${failedCount} failed to load)`, 'info');
        } else {
            showToast(`Copied ${results.length} files to clipboard`, 'success');
        }
    } catch (err: any) {
        showToast(`Failed to copy files: ${err.message}`, 'error');
    }
}

// ─── Show context menu ──────────────────────────────
export function showCardContextMenu(ctx: CanvasContext, card: HTMLElement, x: number, y: number) {
    lazyLoad();
    document.querySelector('.card-context-menu')?.remove();

    const filePath = card.dataset.path;
    const canRunScript = !!filePath && filePath.endsWith('.ts') && !filePath.endsWith('.d.ts');
    const fileActions = getFileActionsForPath(filePath);
    const menu = document.createElement('div');
    menu.className = 'card-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Check if file is in the active layer
    const activeLayer = getActiveLayer();
    const isInActiveLayer = !!(activeLayer && activeLayer.files[filePath]);
    const selectedCards = ctx.snap().context.selectedCards || [];
    const contextSelection = selectedCards.length > 1 ? selectedCards : [filePath];

    function handleAction(action: string) {
        menu.remove();
        if (action === 'copy-path') {
            navigator.clipboard.writeText(filePath).then(() => {
                showToast(`Copied: ${filePath}`, 'info');
            });
        } else if (action === 'copy-selected-content') {
            copyFilesContentToClipboard(ctx, contextSelection);
        } else if (action === 'select') {
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
            _updateSelectionHighlights(ctx);
            _updateArrangeToolbar(ctx);
        } else if (action === 'hide') {
            hideSelectedFiles(ctx, [filePath]);
        } else if (action === 'remove-from-layer') {
            removeFileFromLayer(ctx, layerState.activeLayerId, filePath);
        } else if (action === 'expand') {
            const state = ctx.snap().context;
            const file = state.commitFiles?.find(f => f.path === filePath) ||
                ctx.allFilesData?.find(f => f.path === filePath) ||
                { path: filePath, name: filePath.split('/').pop(), lines: 0 };
            _openFileModal(ctx, file);
        } else if (action === 'edit') {
            const state = ctx.snap().context;
            const file = state.commitFiles?.find(f => f.path === filePath) ||
                ctx.allFilesData?.find(f => f.path === filePath) ||
                { path: filePath, name: filePath.split('/').pop(), lines: 0 };
            _openFileModal(ctx, file, 'edit');
        } else if (action === 'blame') {
            const state = ctx.snap().context;
            const file = state.commitFiles?.find(f => f.path === filePath) ||
                ctx.allFilesData?.find(f => f.path === filePath) ||
                { path: filePath, name: filePath.split('/').pop(), lines: 0 };
            _openFileModal(ctx, file, 'blame');
        } else if (action === 'run-script') {
            const state = ctx.snap().context;
            if (!state.repoPath) {
                showToast('Load a repository first', 'error');
                return;
            }
            fetch('/api/repo/run-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: state.repoPath, filePath }),
            })
                .then(async (res) => {
                    if (!res.ok) throw new Error(await res.text());
                    return res.json();
                })
                .then((data) => {
                    showToast(`Started ${filePath.split('/').pop()} → ${data.stdoutPath}`, 'success');
                    showScriptOutputPanel(ctx, filePath);
                })
                .catch((err) => {
                    showToast(`Run failed: ${err.message}`, 'error');
                });
        } else if (action === 'script-output') {
            showScriptOutputPanel(ctx, filePath);
        } else if (action === 'fit-content') {
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
            _updateSelectionHighlights(ctx);
            _toggleCardExpand(ctx);
        } else if (action === 'fit-screen') {
            ctx.actor.send({ type: 'SELECT_CARD', path: filePath, shift: false });
            _updateSelectionHighlights(ctx);
            _fitScreenSize(ctx);
        } else if (action === 'history') {
            showFileHistory(ctx, filePath);
        } else if (action === 'connect') {
            // Start connection from this file
            import('./connections').then(({ startConnectionFrom }) => {
                if (startConnectionFrom) startConnectionFrom(ctx, filePath);
            }).catch(() => {
                showToast('Connections module not available', 'error');
            });
        } else if (action === 'pin') {
            const nowPinned = togglePinCard(filePath);
            if (nowPinned) {
                card.dataset.pinned = 'true';
                showToast(`📌 Pinned: ${filePath.split('/').pop()}`, 'info');
            } else {
                delete card.dataset.pinned;
                showToast(`Unpinned: ${filePath.split('/').pop()}`, 'info');
            }
            // Trigger viewport culling to apply the change
            import('./viewport-culling').then(m => m.scheduleViewportCulling(ctx));
        } else if (action === 'delete') {
            deleteFile(ctx, filePath, card);
        } else if (action === 'rename') {
            renameFile(ctx, filePath, card);
        }
    }

    async function handleFileAction(action: FileAction) {
        menu.remove();
        const state = ctx.snap().context;
        if (!state.repoPath) {
            showToast('Load a repository first', 'error');
            return;
        }
        try {
            const res = await fetch('/api/repo/file-action-run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: state.repoPath,
                    filePath,
                    action,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const virtualFile = {
                path: data.virtualPath || `.gitmaps/actions/${action.id}.txt`,
                name: (data.virtualPath || `${action.id}.txt`).split('/').pop(),
                content: data.output || '',
                lines: (data.output || '').split('\n').length,
            };
            _openFileModal(ctx, virtualFile, 'full');
            showToast(`${action.label} executed`, 'success');
        } catch (err: any) {
            showToast(`Action failed: ${err.message}`, 'error');
        }
    }

    function handleActionLayer(layerId: string) {
        menu.remove();
        const filesToMove = contextSelection;

        if (layerId === 'new') {
            const name = prompt('Enter a name for the new layer:');
            if (!name) return;
            createLayer(ctx, name);
            const newLayerId = layerState.layers[layerState.layers.length - 1].id;
            moveFilesToLayer(ctx, newLayerId, filesToMove);
            showToast(`Moved ${filesToMove.length} file(s) to "${name}"`, 'info');
        } else {
            const layer = layerState.layers.find(l => l.id === layerId);
            moveFilesToLayer(ctx, layerId, filesToMove);
            showToast(`Moved ${filesToMove.length} file(s) to "${layer?.name || layerId}"`, 'info');
        }
    }

    // Handler for folder selection (recursive — selects all files under chosen directory)
    function handleSelectFolder(dir: string) {
        menu.remove();
        const allPaths = Array.from(ctx.fileCards.keys());
        const deferredPaths = Array.from(ctx.deferredCards.keys());
        const allFilePaths = [...new Set([...allPaths, ...deferredPaths])];
        const folderFiles = dir
            ? allFilePaths.filter(p => p.startsWith(dir + '/'))
            : allFilePaths; // empty dir = root = select all
        folderFiles.forEach((p, i) => {
            ctx.actor.send({ type: 'SELECT_CARD', path: p, shift: i > 0 });
        });
        _updateSelectionHighlights(ctx);
        _updateArrangeToolbar(ctx);
        showToast(`Selected ${folderFiles.length} files from ${dir || 'root'}`, 'info');
    }

    const pinned = isPinned(filePath);
    render(<ContextMenu onAction={handleAction} onActionLayer={handleActionLayer} onFileAction={handleFileAction} onSelectFolder={handleSelectFolder} isInActiveLayer={isInActiveLayer} pinned={pinned} filePath={filePath} canRunScript={canRunScript} selectedCount={contextSelection.length} fileActions={fileActions} />, menu);
    document.body.appendChild(menu);

    requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        if (r.right > window.innerWidth) menu.style.left = `${window.innerWidth - r.width - 8}px`;
        if (r.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - r.height - 8}px`;
    });

    const closeMenu = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

// ─── File history panel (JSX) ───────────────────────
function FileHistoryContent({ fileName, commits, error, loading, onClose, onSelect }: {
    fileName: string; commits: any[]; error?: string; loading: boolean;
    onClose: () => void; onSelect: (hash: string) => void;
}) {
    return (
        <>
            <div className="panel-header">
                <span className="panel-title">History: {fileName}</span>
                <button className="btn-ghost btn-xs" onClick={onClose}>✕</button>
            </div>
            <div className="file-history-list">
                {loading ? (
                    <div style="padding: 16px; color: var(--text-muted); font-size: 0.75rem;">Loading...</div>
                ) : error ? (
                    <div style="padding: 16px; color: var(--error); font-size: 0.75rem;">Error: {error}</div>
                ) : commits.length === 0 ? (
                    <div style="padding: 16px; color: var(--text-muted); font-size: 0.75rem;">No commits found for this file</div>
                ) : (
                    commits.map(c => (
                        <div key={c.hash} className="file-history-item" onClick={() => onSelect(c.hash)}>
                            <span className="file-history-hash">{c.shortHash}</span>
                            <span className="file-history-msg">{c.message}</span>
                            <span className="file-history-date">{new Date(c.date).toLocaleDateString()}</span>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

export async function showFileHistory(ctx: CanvasContext, filePath: string) {
    const state = ctx.snap().context;
    if (!state.repoPath) {
        console.warn('No repository loaded');
        return;
    }

    document.querySelector('.file-history-panel')?.remove();

    const panel = document.createElement('div');
    panel.className = 'file-history-panel';
    const fileName = filePath.split('/').pop() || filePath;

    function closePanel() { panel.remove(); }
    function selectCommitHash(hash: string) {
        import('./repo').then(({ selectCommit }) => {
            selectCommit(ctx, hash);
            panel.remove();
        });
    }

    // Initial loading state
    render(<FileHistoryContent fileName={fileName} commits={[]} loading={true} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    document.querySelector('.canvas-area')?.appendChild(panel);

    try {
        const response = await fetch('/api/repo/file-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: state.repoPath, filePath, limit: 30 })
        });

        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();

        render(<FileHistoryContent fileName={fileName} commits={data.commits} loading={false} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    } catch (err) {
        render(<FileHistoryContent fileName={fileName} commits={[]} error={err.message} loading={false} onClose={closePanel} onSelect={selectCommitHash} />, panel);
    }
}

function ScriptOutputPanel({
    fileName,
    status,
    stdout,
    stderr,
    stdoutPath,
    stderrPath,
    loading,
    error,
    onClose,
    onAction,
}: {
    fileName: string;
    status?: string;
    stdout?: string;
    stderr?: string;
    stdoutPath?: string;
    stderrPath?: string;
    loading: boolean;
    error?: string;
    onClose: () => void;
    onAction: (action: 'run' | 'restart' | 'stop' | 'refresh') => void;
}) {
    const statusColor = status === 'running' ? '#22c55e' : status === 'stopped' ? '#f59e0b' : 'var(--text-muted)';
    return (
        <>
            <div className="panel-header">
                <span className="panel-title">Script Output: {fileName}</span>
                <div style="display:flex; gap:6px; align-items:center; margin-left:auto;">
                    <span style={`font-size:11px; color:${statusColor}; text-transform:uppercase; letter-spacing:0.08em;`}>{status || 'not-found'}</span>
                    <button className="btn-ghost btn-xs" onClick={() => onAction('run')}>Run</button>
                    <button className="btn-ghost btn-xs" onClick={() => onAction('restart')}>Restart</button>
                    <button className="btn-ghost btn-xs" onClick={() => onAction('stop')}>Stop</button>
                    <button className="btn-ghost btn-xs" onClick={() => onAction('refresh')}>Refresh</button>
                    <button className="btn-ghost btn-xs" onClick={onClose}>✕</button>
                </div>
            </div>
            {loading ? (
                <div style="padding: 16px; color: var(--text-muted); font-size: 0.75rem;">Loading...</div>
            ) : error ? (
                <div style="padding: 16px; color: var(--error); font-size: 0.75rem;">Error: {error}</div>
            ) : (
                <div style="display:flex; flex-direction:column; gap:10px; padding:12px; max-height:70vh; overflow:auto;">
                    <div style="font-size:11px; color:var(--text-muted);">stdout → {stdoutPath || '.gout'}<br />stderr → {stderrPath || '.gout'}</div>
                    <div>
                        <div style="font-size:11px; color:#93c5fd; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.08em;">stdout</div>
                        <pre style="margin:0; padding:10px; background:rgba(15,23,42,0.7); border:1px solid var(--border); border-radius:8px; white-space:pre-wrap; font-size:12px; max-height:220px; overflow:auto;">{stdout || '(no stdout yet)'}</pre>
                    </div>
                    <div>
                        <div style="font-size:11px; color:#fca5a5; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.08em;">stderr</div>
                        <pre style="margin:0; padding:10px; background:rgba(15,23,42,0.7); border:1px solid var(--border); border-radius:8px; white-space:pre-wrap; font-size:12px; max-height:220px; overflow:auto;">{stderr || '(no stderr yet)'}</pre>
                    </div>
                </div>
            )}
        </>
    );
}

export function showScriptOutputPanel(ctx: CanvasContext, filePath: string) {
    const state = ctx.snap().context;
    if (!state.repoPath) {
        showToast('Load a repository first', 'error');
        return;
    }

    document.querySelector('.script-output-panel')?.remove();

    const panel = document.createElement('div');
    panel.className = 'file-history-panel script-output-panel';
    const fileName = filePath.split('/').pop() || filePath;
    let pollTimer: any = null;
    let closed = false;

    const closePanel = () => {
        closed = true;
        if (pollTimer) clearTimeout(pollTimer);
        panel.remove();
    };

    const renderState = (payload: any) => {
        render(
            <ScriptOutputPanel
                fileName={fileName}
                status={payload?.status}
                stdout={payload?.stdout}
                stderr={payload?.stderr}
                stdoutPath={payload?.stdoutPath}
                stderrPath={payload?.stderrPath}
                loading={!!payload?.loading}
                error={payload?.error}
                onClose={closePanel}
                onAction={(action) => {
                    if (action === 'refresh') {
                        refresh();
                        return;
                    }
                    const endpoint = action === 'run' ? '/api/repo/run-script' : '/api/repo/script-control';
                    const body = action === 'run'
                        ? { path: state.repoPath, filePath }
                        : { path: state.repoPath, filePath, action };
                    fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    })
                        .then(async (res) => {
                            if (!res.ok) throw new Error(await res.text());
                            return res.json();
                        })
                        .then(() => {
                            showToast(`${action} ${fileName}`, 'success');
                            refresh();
                        })
                        .catch((err) => {
                            showToast(`${action} failed: ${err.message}`, 'error');
                            refresh();
                        });
                }}
            />,
            panel,
        );
    };

    const refresh = async () => {
        if (closed) return;
        renderState({ loading: true });
        try {
            const response = await fetch('/api/repo/script-output', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: state.repoPath, filePath, lines: 120 }),
            });
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            renderState(data);
        } catch (err: any) {
            renderState({ error: err.message });
        } finally {
            if (!closed) {
                pollTimer = setTimeout(refresh, 2000);
            }
        }
    };

    renderState({ loading: true });
    document.querySelector('.canvas-area')?.appendChild(panel);
    refresh();
}

// ─── Delete file ────────────────────────────────────
async function deleteFile(ctx: CanvasContext, filePath: string, card: HTMLElement) {
    const fileName = filePath.split('/').pop() || filePath;
    const state = ctx.snap().context;
    if (!state.repoPath) {
        showToast('No repository loaded', 'error');
        return;
    }

    // Show confirmation dialog
    const confirmed = window.confirm(
        `Delete "${fileName}"?\n\nPath: ${filePath}\n\nThis will permanently delete the file from disk.`
    );
    if (!confirmed) return;

    // Ask if they want git rm
    const useGitRm = window.confirm(
        `Stage deletion with git?\n\nClick OK to use "git rm" (stages for commit).\nClick Cancel to just delete the file.`
    );

    try {
        const res = await fetch('/api/repo/file-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: state.repoPath,
                filePath,
                gitRm: useGitRm,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            showToast(`Delete failed: ${err}`, 'error');
            return;
        }

        // Remove card from DOM and data structures
        card.remove();
        ctx.fileCards.delete(filePath);
        ctx.positions.delete(filePath);
        if (ctx.deferredCards) ctx.deferredCards.delete(filePath);

        // Deselect if selected
        const selected = ctx.snap().context.selectedCards;
        if (selected.includes(filePath)) {
            ctx.actor.send({ type: 'DESELECT_ALL' });
        }

        // Remove from hidden files set if there
        ctx.hiddenFiles.delete(filePath);

        // Remove from allFilesData if present
        if (ctx.allFilesData) {
            ctx.allFilesData = ctx.allFilesData.filter(f => f.path !== filePath);
        }

        showToast(`Deleted ${fileName}${useGitRm ? ' (staged)' : ''}`, 'success');
    } catch (err: any) {
        showToast(`Delete error: ${err.message}`, 'error');
    }
}

// ─── Rename / move file ─────────────────────────────
async function renameFile(ctx: CanvasContext, filePath: string, card: HTMLElement) {
    const state = ctx.snap().context;
    if (!state.repoPath) {
        showToast('No repository loaded', 'error');
        return;
    }

    const newPath = window.prompt('Rename / Move file to:', filePath);
    if (!newPath || newPath === filePath) return;

    // Basic validation
    if (newPath.includes('..') || newPath.startsWith('/')) {
        showToast('Invalid path', 'error');
        return;
    }

    try {
        const res = await fetch('/api/repo/file-rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: state.repoPath,
                oldPath: filePath,
                newPath,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            showToast(`Rename failed: ${err}`, 'error');
            return;
        }

        // Update card DOM
        card.dataset.path = newPath;
        const nameEl = card.querySelector('.file-name, .card-filename');
        if (nameEl) nameEl.textContent = newPath.split('/').pop() || newPath;

        // Re-key internal data structures
        const pos = ctx.positions.get(filePath);
        if (pos) {
            ctx.positions.delete(filePath);
            ctx.positions.set(newPath, pos);
        }

        ctx.fileCards.delete(filePath);
        ctx.fileCards.set(newPath, card);

        if (ctx.deferredCards) {
            const deferred = ctx.deferredCards.get(filePath);
            if (deferred) {
                ctx.deferredCards.delete(filePath);
                ctx.deferredCards.set(newPath, deferred);
            }
        }

        // Update allFilesData
        if (ctx.allFilesData) {
            const fileData = ctx.allFilesData.find(f => f.path === filePath);
            if (fileData) {
                fileData.path = newPath;
                fileData.name = newPath.split('/').pop() || newPath;
            }
        }

        const newName = newPath.split('/').pop() || newPath;
        showToast(`Renamed → ${newName}`, 'success');
    } catch (err: any) {
        showToast(`Rename error: ${err.message}`, 'error');
    }
}
