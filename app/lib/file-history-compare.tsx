// @ts-nocheck
/**
 * Multi-file history comparison modal.
 *
 * Rows are file paths. Columns are the working tree and the latest commits that
 * changed at least one selected file. The canvas never changes commit while the
 * user inspects history here.
 */
import { render } from 'tradjs/client';
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { showToast } from './utils';

type HistoryColumn = {
    hash: string;
    shortHash: string;
    date: string;
    author: string;
    message: string;
    kind: 'working' | 'commit';
};

type HistoryCell = {
    exists: boolean;
    binary: boolean;
    content: string | null;
    byteLength: number;
    lines: number;
    truncated: boolean;
    reason?: string;
    changedFromOlder: boolean;
};

type HistoryRow = {
    path: string;
    name: string;
    cells: HistoryCell[];
};

type HistoryModel = {
    columns: HistoryColumn[];
    rows: HistoryRow[];
    files: number;
    commitCount: number;
    limit: number;
    responseTruncated: boolean;
};

const STYLE_ID = 'file-history-compare-styles';
let activeClose: (() => void) | null = null;

export function openFileHistoryComparison(ctx: CanvasContext, inputPaths: string[]) {
    const state = ctx.snap().context;
    const paths = Array.from(new Set((inputPaths || []).filter(Boolean)));

    if (!state.repoPath) {
        showToast('Load a repository first', 'error');
        return;
    }
    if (paths.length === 0) {
        showToast('Select at least one file to compare', 'info');
        return;
    }

    activeClose?.();
    ensureStyles();

    const host = document.createElement('div');
    host.className = 'history-compare-host';
    document.body.appendChild(host);

    let loading = true;
    let error = '';
    let model: HistoryModel | null = null;
    let limit = paths.length > 6 ? 4 : 5;
    let requestSerial = 0;

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') close();
    };

    function close() {
        window.removeEventListener('keydown', onKeyDown);
        render(null, host);
        host.remove();
        if (activeClose === close) activeClose = null;
    }

    function draw() {
        render(
            <HistoryCompareModal
                filePaths={paths}
                loading={loading}
                error={error}
                model={model}
                limit={limit}
                onClose={close}
                onLimitChange={(next: number) => {
                    limit = next;
                    load();
                }}
                onReload={() => load()}
            />,
            host,
        );
    }

    async function load() {
        const serial = ++requestSerial;
        loading = true;
        error = '';
        draw();

        await measure('ui:history-compare:load', async () => {
            try {
                const response = await fetch('/api/repo/file-history-compare', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: state.repoPath,
                        filePaths: paths,
                        limit,
                    }),
                });

                if (!response.ok) throw new Error(await response.text());
                const next = await response.json() as HistoryModel;
                if (serial !== requestSerial) return;
                model = next;
            } catch (err: any) {
                if (serial !== requestSerial) return;
                error = err.message || 'Unable to load file history';
            } finally {
                if (serial === requestSerial) {
                    loading = false;
                    draw();
                }
            }
        });
    }

    window.addEventListener('keydown', onKeyDown);
    activeClose = close;
    draw();
    void load();
}

/** Kept for existing cards.tsx exports and any single-file callers. */
export function showFileHistory(ctx: CanvasContext, filePath: string) {
    openFileHistoryComparison(ctx, [filePath]);
}

function HistoryCompareModal({
    filePaths,
    loading,
    error,
    model,
    limit,
    onClose,
    onLimitChange,
    onReload,
}: {
    filePaths: string[];
    loading: boolean;
    error: string;
    model: HistoryModel | null;
    limit: number;
    onClose: () => void;
    onLimitChange: (value: number) => void;
    onReload: () => void;
}) {
    return (
        <>
            <div className="hcm-backdrop" onClick={onClose}></div>
            <section className="hcm-modal" role="dialog" aria-modal="true" aria-label="File history comparison">
                <header className="hcm-header">
                    <div className="hcm-title-wrap">
                        <div className="hcm-title">History comparison</div>
                        <div className="hcm-subtitle">
                            {filePaths.length} {filePaths.length === 1 ? 'file' : 'files'} · rows are files, columns are repository snapshots
                        </div>
                    </div>
                    <label className="hcm-limit">
                        Commits
                        <select value={String(limit)} onChange={(event: any) => onLimitChange(Number(event.target.value))}>
                            <option value="3">3</option>
                            <option value="5">5</option>
                            <option value="8">8</option>
                            <option value="10">10</option>
                        </select>
                    </label>
                    <button type="button" className="hcm-button" onClick={onReload} title="Reload history">↻</button>
                    <button type="button" className="hcm-close" onClick={onClose} title="Close">✕</button>
                </header>

                {loading && !model ? (
                    <div className="hcm-state">Loading snapshots…</div>
                ) : error ? (
                    <div className="hcm-state hcm-error">
                        <div>Could not load history comparison.</div>
                        <code>{error}</code>
                    </div>
                ) : model && model.columns.length <= 1 ? (
                    <div className="hcm-state">No committed history was found for the selected files.</div>
                ) : model ? (
                    <>
                        {loading && <div className="hcm-refreshing">Refreshing…</div>}
                        {model.responseTruncated && (
                            <div className="hcm-warning">
                                Some very large versions were truncated to keep comparison responsive.
                            </div>
                        )}
                        <div className="hcm-scroll">
                            <div
                                className="hcm-grid"
                                style={{ gridTemplateColumns: `260px repeat(${model.columns.length}, minmax(390px, 1fr))` }}
                            >
                                <div className="hcm-corner">File</div>
                                {model.columns.map(column => (
                                    <CommitHeader key={column.hash} column={column} />
                                ))}
                                {model.rows.map(row => (
                                    <HistoryRowCells key={row.path} row={row} columns={model.columns} />
                                ))}
                            </div>
                        </div>
                    </>
                ) : null}
            </section>
        </>
    );
}

function CommitHeader({ column }: { column: HistoryColumn }) {
    if (column.kind === 'working') {
        return (
            <div className="hcm-commit hcm-working">
                <strong>Current</strong>
                <span>Working tree</span>
            </div>
        );
    }

    return (
        <div className="hcm-commit">
            <div className="hcm-hash">{column.shortHash}</div>
            <div className="hcm-message" title={column.message}>{column.message || 'No message'}</div>
            <div className="hcm-meta">
                <span>{formatDate(column.date)}</span>
                <span>{column.author}</span>
            </div>
        </div>
    );
}

function FileLabel({ row }: { row: HistoryRow }) {
    return (
        <div className="hcm-file" title={row.path}>
            <strong>{row.name}</strong>
            <span>{row.path}</span>
        </div>
    );
}

function HistoryRowCells({ row, columns }: { row: HistoryRow; columns: HistoryColumn[] }) {
    return (
        <>
            <FileLabel row={row} />
            {row.cells.map((cell, index) => (
                <VersionCell key={`${row.path}:${columns[index].hash}`} cell={cell} />
            ))}
        </>
    );
}

function VersionCell({ cell }: { cell: HistoryCell }) {
    const classes = [
        'hcm-cell',
        cell.changedFromOlder ? 'is-changed' : '',
        !cell.exists ? 'is-empty' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={classes}>
            <div className="hcm-cell-meta">
                {!cell.exists ? (
                    <span className="hcm-muted">Not present</span>
                ) : cell.binary ? (
                    <span className="hcm-muted">Binary · {formatBytes(cell.byteLength)}</span>
                ) : (
                    <span className="hcm-muted">{cell.lines} lines · {formatBytes(cell.byteLength)}</span>
                )}
                {cell.changedFromOlder && <span className="hcm-changed">changed</span>}
                {cell.truncated && <span className="hcm-truncated">truncated</span>}
            </div>
            {!cell.exists || cell.binary ? (
                <div className="hcm-cell-empty">{cell.reason || 'No textual preview'}</div>
            ) : (
                <pre className="hcm-code"><code>{cell.content || ''}</code></pre>
            )}
        </div>
    );
}

function formatDate(value: string) {
    if (!value) return '';
    return new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.history-compare-host {
    position: fixed;
    inset: 0;
    z-index: 20000;
    font-family: Inter, system-ui, sans-serif;
}
.hcm-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(2, 6, 23, 0.72);
    backdrop-filter: blur(4px);
}
.hcm-modal {
    position: absolute;
    inset: 3.2vh 2.5vw;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    color: var(--text-primary, #e2e8f0);
    background: var(--bg-secondary, #0f172a);
    border: 1px solid var(--border, #26324a);
    border-radius: 16px;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.52);
}
.hcm-header {
    flex: none;
    height: 68px;
    padding: 0 18px 0 22px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border, #26324a);
    background: rgba(15, 23, 42, 0.96);
}
.hcm-title-wrap {
    flex: 1;
    min-width: 0;
}
.hcm-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
}
.hcm-subtitle {
    margin-top: 3px;
    color: var(--text-muted, #8ea0bb);
    font-size: 12px;
}
.hcm-limit {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-muted, #8ea0bb);
    font-size: 12px;
}
.hcm-limit select {
    color: inherit;
    background: rgba(15, 23, 42, .9);
    border: 1px solid var(--border, #26324a);
    border-radius: 7px;
    padding: 6px 8px;
}
.hcm-button, .hcm-close {
    display: inline-grid;
    place-items: center;
    height: 34px;
    min-width: 34px;
    color: var(--text-muted, #8ea0bb);
    background: transparent;
    border: 1px solid var(--border, #26324a);
    border-radius: 8px;
    cursor: pointer;
}
.hcm-button:hover, .hcm-close:hover {
    color: var(--text-primary, #e2e8f0);
    background: rgba(148, 163, 184, 0.12);
}
.hcm-refreshing {
    position: absolute;
    top: 76px;
    right: 22px;
    z-index: 8;
    padding: 5px 10px;
    border-radius: 14px;
    color: #c4b5fd;
    background: rgba(76, 29, 149, 0.7);
    font-size: 11px;
}
.hcm-warning {
    flex: none;
    padding: 8px 18px;
    color: #fbbf24;
    border-bottom: 1px solid rgba(251, 191, 36, .18);
    background: rgba(120, 53, 15, .18);
    font-size: 12px;
}
.hcm-state {
    flex: 1;
    display: grid;
    align-content: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-muted, #8ea0bb);
    font-size: 14px;
}
.hcm-error code {
    max-width: 70vw;
    color: #fca5a5;
    white-space: pre-wrap;
}
.hcm-scroll {
    flex: 1;
    overflow: auto;
    min-height: 0;
    background: rgba(2, 6, 23, 0.32);
}
.hcm-grid {
    display: grid;
    min-width: max-content;
    align-items: stretch;
}
.hcm-corner, .hcm-commit {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 84px;
    box-sizing: border-box;
    padding: 13px 14px;
    background: #10192b;
    border-bottom: 1px solid var(--border, #26324a);
    border-right: 1px solid var(--border, #26324a);
}
.hcm-corner {
    left: 0;
    z-index: 7;
    color: var(--text-muted, #8ea0bb);
    text-transform: uppercase;
    letter-spacing: .08em;
    font-size: 11px;
    font-weight: 600;
}
.hcm-commit strong, .hcm-hash {
    display: block;
    color: #c4b5fd;
    font: 600 12px "JetBrains Mono", ui-monospace, monospace;
}
.hcm-working strong {
    color: #86efac;
}
.hcm-working span {
    display: block;
    margin-top: 8px;
    color: var(--text-muted, #8ea0bb);
    font-size: 12px;
}
.hcm-message {
    margin-top: 6px;
    max-width: 350px;
    overflow: hidden;
    color: var(--text-primary, #e2e8f0);
    font-size: 12px;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.hcm-meta {
    display: flex;
    gap: 10px;
    margin-top: 5px;
    color: var(--text-muted, #8ea0bb);
    font-size: 11px;
}
.hcm-file {
    position: sticky;
    left: 0;
    z-index: 3;
    box-sizing: border-box;
    height: 338px;
    padding: 15px 14px;
    overflow: hidden;
    background: #0f182a;
    border-bottom: 1px solid var(--border, #26324a);
    border-right: 1px solid var(--border, #26324a);
}
.hcm-file strong {
    display: block;
    overflow: hidden;
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.hcm-file span {
    display: block;
    margin-top: 8px;
    overflow-wrap: anywhere;
    color: var(--text-muted, #8ea0bb);
    font: 11px/1.55 "JetBrains Mono", ui-monospace, monospace;
}
.hcm-cell {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 338px;
    min-width: 0;
    overflow: hidden;
    border-bottom: 1px solid var(--border, #26324a);
    border-right: 1px solid var(--border, #26324a);
    background: rgba(3, 7, 18, .38);
}
.hcm-cell.is-changed {
    box-shadow: inset 3px 0 0 rgba(167, 139, 250, .8);
}
.hcm-cell-meta {
    flex: none;
    min-height: 35px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 11px;
    border-bottom: 1px solid rgba(148, 163, 184, .10);
    font-size: 11px;
}
.hcm-muted {
    color: var(--text-muted, #8ea0bb);
}
.hcm-changed, .hcm-truncated {
    padding: 3px 7px;
    border-radius: 11px;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-size: 9px;
    font-weight: 600;
}
.hcm-changed {
    color: #ddd6fe;
    background: rgba(109, 40, 217, .34);
}
.hcm-truncated {
    color: #fcd34d;
    background: rgba(146, 64, 14, .34);
}
.hcm-code {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 10px 12px 14px;
    color: #dbe4f0;
    font: 11.5px/1.55 "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
    tab-size: 4;
    white-space: pre;
}
.hcm-cell-empty {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 18px;
    color: var(--text-muted, #8ea0bb);
    font-size: 12px;
    text-align: center;
}
`;
    document.head.appendChild(style);
}
