/** @jsxImportSource tradjs/client */

import { WORKING_TREE, type CanvasSnapshot, type FileRecord, type HistoryResponse, type Position } from './types';
import { fileName, parentPath, shortDate } from './utils';

export interface CanvasActions {
  select(path: string, additive: boolean): void;
  openFile(path: string): void;
  openMenu(event: MouseEvent, path: string): void;
  startCardDrag(event: PointerEvent, path: string): void;
  closeMenu(): void;
  history(paths: string[]): void;
  arrange(paths: string[], mode: 'row' | 'grid'): void;
  hide(paths: string[]): void;
  closeModal(): void;
  selectCommit(ref: string): void;
}

export function CanvasSurface({ snapshot, actions }: { snapshot: CanvasSnapshot; actions: CanvasActions }) {
  const files = snapshot.files.filter(file => !snapshot.hidden.has(file.path));

  return (
    <>
      {files.map((file, index) => (
        <FileCard
          file={file}
          position={snapshot.positions.get(file.path) || autoPosition(index)}
          selected={snapshot.selected.has(file.path)}
          actions={actions}
        />
      ))}
    </>
  );
}

function autoPosition(index: number): Position {
  const columns = 3;
  return {
    x: (index % columns) * 472,
    y: Math.floor(index / columns) * 382,
    width: 450,
    height: 360,
  };
}

function FileCard({
  file,
  position,
  selected,
  actions,
}: {
  file: FileRecord;
  position: Position;
  selected: boolean;
  actions: CanvasActions;
}) {
  return (
    <article
      className={`plain-card status-${file.status || 'unmodified'}${selected ? ' is-selected' : ''}`}
      data-file-path={file.path}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
      }}
      onClick={(event: MouseEvent) => {
        if ((event.target as HTMLElement).closest('.plain-card__body')) return;
        actions.select(file.path, event.shiftKey || event.ctrlKey || event.metaKey);
      }}
      onDblClick={() => actions.openFile(file.path)}
      onContextMenu={(event: MouseEvent) => {
        event.preventDefault();
        actions.openMenu(event, file.path);
      }}
    >
      <header className="plain-card__header" onPointerDown={(event: PointerEvent) => actions.startCardDrag(event, file.path)}>
        <span className="plain-card__dot" />
        <span className="plain-card__name" title={file.path}>{file.name || fileName(file.path)}</span>
        <span className="plain-card__status">{file.status || file.ext || ''}</span>
      </header>
      <div className="plain-card__path" title={file.path}>{parentPath(file.path)}</div>
      <div className="plain-card__body">
        <CardContents file={file} />
      </div>
    </article>
  );
}

function CardContents({ file }: { file: FileRecord }) {
  if (file.isBinary) return <div className="plain-card__message">Binary file</div>;
  if (file.contentError || file.metaError) return <div className="plain-card__message">{file.contentError || file.metaError}</div>;
  if (typeof file.content === 'string') return <pre>{file.content}</pre>;
  if (file.previewContent) return <pre>{file.previewContent}</pre>;
  return <div className="plain-card__message">Loading file…</div>;
}

export function TimelineView({
  snapshot,
  actions,
}: {
  snapshot: CanvasSnapshot;
  actions: CanvasActions;
}) {
  const commits = [{ hash: WORKING_TREE, message: 'All repository files' }, ...snapshot.commits.filter(commit => commit.hash !== WORKING_TREE)];

  return (
    <>
      {commits.map(commit => (
        <button
          type="button"
          className={`plain-timeline${snapshot.ref === commit.hash ? ' active' : ''}`}
          onClick={() => actions.selectCommit(commit.hash)}
        >
          <strong>
            {commit.hash === WORKING_TREE ? 'All files' : commit.hash.slice(0, 7)}
            {commit.date ? ` · ${shortDate(commit.date)}` : ''}
          </strong>
          <span>{commit.message}</span>
        </button>
      ))}
    </>
  );
}

export function ContextMenuView({
  snapshot,
  actions,
}: {
  snapshot: CanvasSnapshot;
  actions: CanvasActions;
}) {
  const menu = snapshot.menu;
  if (!menu) return null;

  const paths = snapshot.selected.has(menu.path)
    ? Array.from(snapshot.selected)
    : [menu.path];

  return (
    <div className="plain-context" style={{ left: `${menu.x}px`, top: `${menu.y}px` }}>
      <button type="button" onClick={() => { actions.closeMenu(); actions.openFile(menu.path); }}>Open full file</button>
      <button type="button" onClick={() => { actions.closeMenu(); actions.history(paths); }}>
        History{paths.length > 1 ? ` (${paths.length} files)` : ''}
      </button>
      <hr />
      <button type="button" onClick={() => { actions.closeMenu(); actions.arrange(paths, 'row'); }}>Arrange in row</button>
      <button type="button" onClick={() => { actions.closeMenu(); actions.arrange(paths, 'grid'); }}>Arrange in grid</button>
      <button type="button" onClick={() => { actions.closeMenu(); actions.hide(paths); }}>Hide from canvas</button>
    </div>
  );
}

export function ModalView({ snapshot, actions }: { snapshot: CanvasSnapshot; actions: CanvasActions }) {
  const modal = snapshot.modal;
  if (!modal) return null;

  if (modal.kind === 'preview') {
    return (
      <div className="plain-modal" onPointerDown={(event: PointerEvent) => {
        if (event.target === event.currentTarget) actions.closeModal();
      }}>
        <div className="plain-modal__box">
          <header className="plain-modal__header">
            <div className="plain-modal__heading">
              <strong>{fileName(modal.path)}</strong>
              <span>{modal.path}</span>
            </div>
            <button type="button" className="plain-modal__close" onClick={() => actions.closeModal()}>×</button>
          </header>
          <pre className="plain-preview">{modal.loading ? 'Loading…' : modal.error || modal.content}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="plain-modal" onPointerDown={(event: PointerEvent) => {
      if (event.target === event.currentTarget) actions.closeModal();
    }}>
      <div className="plain-modal__box">
        <header className="plain-modal__header">
          <div className="plain-modal__heading">
            <strong>File history comparison</strong>
            <span>{modal.paths.length === 1 ? modal.paths[0] : `${modal.paths.length} selected files`}</span>
          </div>
          <button type="button" className="plain-modal__close" onClick={() => actions.closeModal()}>×</button>
        </header>
        {modal.loading ? <div className="plain-history__message">Loading comparison…</div> : modal.error ? (
          <div className="plain-history__message">{modal.error}</div>
        ) : (
          <HistoryTable result={modal.result!} />
        )}
      </div>
    </div>
  );
}

function HistoryTable({ result }: { result: HistoryResponse }) {
  return (
    <div className="plain-history">
      <div className="plain-history__grid" style={{ gridTemplateColumns: `250px repeat(${result.columns.length}, 360px)` }}>
        <div className="plain-history__corner">Files × versions</div>
        {result.columns.map(column => (
          <div className="plain-history__head">
            <strong>{column.shortHash}</strong>
            <span>{column.message}</span>
            <small>{shortDate(column.date)}</small>
          </div>
        ))}
        {result.rows.map(row => (
          <>
            <div className="plain-history__file">
              {row.name}
              <span>{row.path}</span>
            </div>
            {row.cells.map(cell => (
              <div className="plain-history__cell">
                {cell.changedFromOlder ? <span className="plain-history__changed">●</span> : null}
                {!cell.exists || cell.binary ? (
                  <div className="plain-history__message">{cell.reason || (cell.binary ? 'Binary file' : 'File not present')}</div>
                ) : (
                  <pre>{cell.content || ''}{cell.truncated ? '\n\n— Truncated —' : ''}</pre>
                )}
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

export function ToastView({ snapshot }: { snapshot: CanvasSnapshot }) {
  if (!snapshot.toast) return null;
  return (
    <div className={`plain-canvas-toast${snapshot.toast.kind === 'error' ? ' is-error' : ''}`}>
      {snapshot.toast.message}
    </div>
  );
}
