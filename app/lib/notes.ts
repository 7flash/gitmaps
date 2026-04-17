// @ts-nocheck
import type { CanvasContext } from './context';

const NOTES_STORAGE_PREFIX = 'gitcanvas:notes:';

export type LineNote = {
  id: string;
  path: string;
  lineNumber: number;
  originalLineNumber: number;
  lineText: string;
  note: string;
  createdAt: number;
  updatedAt: number;
};

function getNotesStorageKey(repoPath: string) {
  return `${NOTES_STORAGE_PREFIX}${repoPath || ''}`;
}

export function normalizeLineText(text: string) {
  return String(text || '').replace(/\t/g, '  ').trim();
}

export function getFileLines(content: string) {
  return String(content || '').replace(/\r\n/g, '\n').split('\n');
}

export function createLineNote(input: {
  path: string;
  lineNumber: number;
  lineText: string;
  note: string;
  id?: string;
  createdAt?: number;
  updatedAt?: number;
}): LineNote {
  const now = Date.now();
  return {
    id: input.id || `note_${now}_${Math.random().toString(36).slice(2, 8)}`,
    path: input.path,
    lineNumber: Math.max(1, Number(input.lineNumber) || 1),
    originalLineNumber: Math.max(1, Number(input.lineNumber) || 1),
    lineText: normalizeLineText(input.lineText),
    note: String(input.note || ''),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function findBestLineMatch(lines: string[], targetText: string, previousLineNumber = 1) {
  const normalizedTarget = normalizeLineText(targetText);
  if (!normalizedTarget) return previousLineNumber;

  const exactMatches: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (normalizeLineText(lines[i]) === normalizedTarget) {
      exactMatches.push(i + 1);
    }
  }

  if (exactMatches.length === 0) return previousLineNumber;
  if (exactMatches.length === 1) return exactMatches[0];

  let best = exactMatches[0];
  let bestDistance = Math.abs(best - previousLineNumber);
  for (const lineNumber of exactMatches) {
    const distance = Math.abs(lineNumber - previousLineNumber);
    if (distance < bestDistance) {
      best = lineNumber;
      bestDistance = distance;
    }
  }
  return best;
}

export function reconcileNoteAgainstFile(note: LineNote, file: any): LineNote {
  if (!file || file.path !== note.path || typeof file.content !== 'string') return note;
  const lines = getFileLines(file.content);
  const nextLineNumber = Math.max(1, Math.min(lines.length || 1, findBestLineMatch(lines, note.lineText, note.lineNumber || note.originalLineNumber || 1)));
  return {
    ...note,
    lineNumber: nextLineNumber,
    updatedAt: Date.now(),
  };
}

export function reconcileNotesAgainstFiles(notes: LineNote[], files: any[]) {
  const fileMap = new Map((files || []).map((file) => [file.path, file]));
  return (notes || []).map((note) => reconcileNoteAgainstFile(note, fileMap.get(note.path)));
}

export function loadNotes(repoPath: string): LineNote[] {
  if (!repoPath) return [];
  try {
    const raw = localStorage.getItem(getNotesStorageKey(repoPath));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((note) => ({
      ...note,
      lineNumber: Math.max(1, Number(note.lineNumber || note.originalLineNumber || 1)),
      originalLineNumber: Math.max(1, Number(note.originalLineNumber || note.lineNumber || 1)),
      lineText: normalizeLineText(note.lineText),
      note: String(note.note || ''),
    }));
  } catch {
    return [];
  }
}

export function saveNotes(repoPath: string, notes: LineNote[]) {
  if (!repoPath) return;
  try {
    localStorage.setItem(getNotesStorageKey(repoPath), JSON.stringify(notes || []));
  } catch { }
}

export function setCanvasNotes(ctx: CanvasContext, notes: LineNote[]) {
  ctx.notes = Array.isArray(notes) ? notes : [];
  window.dispatchEvent(new CustomEvent('gitcanvas:notes-changed', { detail: ctx.notes }));
}

export function loadAndReconcileNotes(ctx: CanvasContext, files: any[]) {
  const repoPath = ctx?.snap?.()?.context?.repoPath || '';
  const notes = reconcileNotesAgainstFiles(loadNotes(repoPath), files || []);
  setCanvasNotes(ctx, notes);
  saveNotes(repoPath, notes);
  return notes;
}

export function upsertNote(ctx: CanvasContext, noteInput: LineNote | Parameters<typeof createLineNote>[0]) {
  const repoPath = ctx?.snap?.()?.context?.repoPath || '';
  const current = Array.isArray(ctx?.notes) ? [...ctx.notes] : loadNotes(repoPath);
  const incoming = 'originalLineNumber' in noteInput ? noteInput as LineNote : createLineNote(noteInput as any);
  const next = current.filter((note) => note.id !== incoming.id).concat({ ...incoming, updatedAt: Date.now() });
  setCanvasNotes(ctx, next);
  saveNotes(repoPath, next);
  return incoming;
}

export function deleteNote(ctx: CanvasContext, noteId: string) {
  const repoPath = ctx?.snap?.()?.context?.repoPath || '';
  const next = (ctx?.notes || []).filter((note) => note.id !== noteId);
  setCanvasNotes(ctx, next);
  saveNotes(repoPath, next);
}

export function getNotesForFile(ctx: CanvasContext, path: string) {
  return (ctx?.notes || []).filter((note) => note.path === path);
}
