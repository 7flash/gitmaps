import type { DomRoots } from './types';

export function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function required<T extends HTMLElement>(id: string): T {
  const value = element<T>(id);
  if (!value) throw new Error(`Missing #${id}.`);
  return value;
}

export function bindRoots(): DomRoots {
  return {
    viewport: required('canvasViewport'),
    canvas: required('canvasContent'),
    menu: required('canvasContextMenuPortal'),
    modal: required('canvasModalPortal'),
    toast: required('canvasToastPortal'),
    repoSelect: element('repoSelect'),
    repoPath: element('repoPath'),
    folderPicker: element('folderPickerInput'),
    cloneStatus: element('cloneStatus'),
    timeline: element('timelineContainer'),
    commitCount: element('commitCount'),
    currentCommit: element('currentCommitInfo'),
    fileCount: element('fileCount'),
  };
}

export function fileName(path: string): string {
  return path.replaceAll('\\', '/').split('/').filter(Boolean).pop() || path;
}

export function parentPath(path: string): string {
  const pieces = path.replaceAll('\\', '/').split('/');
  pieces.pop();
  return pieces.join('/');
}

export function shortDate(input?: string): string {
  if (!input) return '';
  const date = new Date(input);
  return Number.isNaN(date.getTime())
    ? input
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function listen(
  disposers: Array<() => void>,
  target: EventTarget | null,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): void {
  if (!target) return;
  target.addEventListener(type, listener, options);
  disposers.push(() => target.removeEventListener(type, listener, options));
}