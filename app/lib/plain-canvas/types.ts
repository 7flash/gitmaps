export const WORKING_TREE = '__working__';

export type FileStatus = 'unmodified' | 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'snapshot' | string;

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
  viewMode?: 'workdir' | 'diff';
  isWorkingContent?: boolean;
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

export interface CanvasRefs {
  viewport: HTMLElement;
  canvas: HTMLElement;
  repoSelect: HTMLSelectElement | null;
  repoPath: HTMLInputElement | null;
  folderPicker: HTMLInputElement | null;
  status: HTMLElement | null;
  timeline: HTMLElement | null;
  commitCount: HTMLElement | null;
  currentCommit: HTMLElement | null;
  fileCount: HTMLElement | null;
}

export interface CanvasState {
  repoPath: string;
  ref: string;
  commits: Commit[];
  files: Map<string, FileRecord>;
  cards: Map<string, HTMLElement>;
  positions: Map<string, Position>;
  selected: Set<string>;
  hidden: Set<string>;
  transform: Transform;
  loadId: number;
  abort: AbortController | null;
}

export interface HistoryResponse {
  columns: Array<{
    hash: string;
    shortHash: string;
    date: string;
    author: string;
    message: string;
    kind: 'working' | 'commit';
  }>;
  rows: Array<{
    path: string;
    name: string;
    cells: Array<{
      exists: boolean;
      binary: boolean;
      content: string | null;
      lines: number;
      truncated: boolean;
      reason?: string;
      changedFromOlder: boolean;
    }>;
  }>;
}