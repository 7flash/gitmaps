export const WORKING_TREE = '__working__';

export type FileStatus =
  | 'unmodified'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'snapshot'
  | string;

export interface Commit {
  hash: string;
  message: string;
  author?: string;
  date?: string;
  isVirtual?: boolean;
}

export interface FileRecord {
  path: string;
  name?: string;
  ext?: string;
  type?: 'file';
  previewContent?: string;
  content?: string | null;
  contentError?: string | null;
  metaError?: string | null;
  lines?: number;
  size?: number;
  isBinary?: boolean;
  status?: FileStatus;
  hunks?: unknown[];
}

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Transform {
  x: number;
  y: number;
  zoom: number;
}

export interface ToastState {
  message: string;
  kind: 'normal' | 'error';
}

export interface MenuState {
  x: number;
  y: number;
  path: string;
}

export interface HistoryColumn {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  message: string;
  kind: 'working' | 'commit';
}

export interface HistoryCell {
  exists: boolean;
  binary: boolean;
  content: string | null;
  lines: number;
  truncated: boolean;
  reason?: string;
  changedFromOlder: boolean;
}

export interface HistoryRow {
  path: string;
  name: string;
  cells: HistoryCell[];
}

export interface HistoryResponse {
  columns: HistoryColumn[];
  rows: HistoryRow[];
}

export type ModalState =
  | null
  | { kind: 'preview'; path: string; loading: boolean; content: string; error?: string }
  | { kind: 'history'; paths: string[]; loading: boolean; result?: HistoryResponse; error?: string };

export interface CanvasSnapshot {
  repoPath: string;
  ref: string;
  commits: Commit[];
  files: FileRecord[];
  selected: Set<string>;
  positions: Map<string, Position>;
  hidden: Set<string>;
  transform: Transform;
  loadingMessage: string | null;
  menu: MenuState | null;
  modal: ModalState;
  toast: ToastState | null;
}

export interface DomRoots {
  viewport: HTMLElement;
  canvas: HTMLElement;
  menu: HTMLElement;
  modal: HTMLElement;
  toast: HTMLElement;
  repoSelect: HTMLSelectElement | null;
  repoPath: HTMLInputElement | null;
  folderPicker: HTMLInputElement | null;
  cloneStatus: HTMLElement | null;
  timeline: HTMLElement | null;
  commitCount: HTMLElement | null;
  currentCommit: HTMLElement | null;
  fileCount: HTMLElement | null;
}
