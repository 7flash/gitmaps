import type { CanvasRefs } from './types';

export function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fileName(filePath: string): string {
  return filePath.replaceAll('\\', '/').split('/').filter(Boolean).pop() || filePath;
}

export function parentPath(filePath: string): string {
  const segments = filePath.replaceAll('\\', '/').split('/');
  segments.pop();
  return segments.join('/');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function shortDate(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function statusMessage(
  refs: CanvasRefs,
  message: string,
  kind: 'loading' | 'neutral' | 'error' = 'neutral',
): void {
  if (!refs.status) return;
  refs.status.style.display = 'block';
  refs.status.className = `clone-status plain-canvas-status-${kind}`;
  refs.status.textContent = message;
}

export function clearStatus(refs: CanvasRefs): void {
  if (!refs.status) return;
  refs.status.style.display = 'none';
  refs.status.className = 'clone-status';
  refs.status.textContent = '';
}

export function toast(message: string, error = false): void {
  document.querySelector('.plain-canvas-toast')?.remove();
  const element = document.createElement('div');
  element.className = `plain-canvas-toast${error ? ' is-error' : ''}`;
  element.textContent = message;
  document.body.appendChild(element);
  window.setTimeout(() => element.remove(), 3200);
}

export function addListener(
  disposers: Array<() => void>,
  target: EventTarget | null,
  event: string,
  listener: EventListenerOrEventListenerObject,
  options?: AddEventListenerOptions | boolean,
): void {
  if (!target) return;
  target.addEventListener(event, listener, options);
  disposers.push(() => target.removeEventListener(event, listener, options));
}
