import type { CanvasContext } from './context';
import { getSettings, updateSettings } from './settings';

const FILE_FONT_STORAGE_PREFIX = 'gitcanvas:file-font-sizes:';
const MIN_FONT_SIZE = 5;
const MAX_FONT_SIZE = 32;

function clampFontSize(value: number) {
  if (!Number.isFinite(value)) return getSettings().fontSize || 12;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(value * 10) / 10));
}

function getRepoPath(ctx: CanvasContext): string {
  return ctx.snap?.()?.context?.repoPath || 'default';
}

function getStorageKey(ctx: CanvasContext) {
  return `${FILE_FONT_STORAGE_PREFIX}${getRepoPath(ctx)}`;
}

export function getGlobalCodeFontSize(): number {
  return clampFontSize(Number(getSettings().fontSize || 12));
}

export function setGlobalCodeFontSize(fontSize: number): number {
  const next = clampFontSize(fontSize);
  updateSettings({ fontSize: next });
  window.dispatchEvent(new CustomEvent('gitcanvas:font-size-changed', { detail: { fontSize: next, scope: 'global' } }));
  return next;
}

export function getPerFileFontSizes(ctx: CanvasContext): Record<string, number> {
  try {
    const raw = localStorage.getItem(getStorageKey(ctx));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getFileCodeFontSize(ctx: CanvasContext, filePath: string): number {
  const perFile = getPerFileFontSizes(ctx);
  return clampFontSize(perFile[filePath] || getGlobalCodeFontSize());
}

export function setFileCodeFontSize(ctx: CanvasContext, filePath: string, fontSize: number): number {
  const next = clampFontSize(fontSize);
  const perFile = getPerFileFontSizes(ctx);
  perFile[filePath] = next;
  try {
    localStorage.setItem(getStorageKey(ctx), JSON.stringify(perFile));
  } catch { }
  window.dispatchEvent(new CustomEvent('gitcanvas:font-size-changed', { detail: { fontSize: next, filePath, scope: 'file' } }));
  return next;
}

export function resetFileCodeFontSize(ctx: CanvasContext, filePath: string) {
  const perFile = getPerFileFontSizes(ctx);
  delete perFile[filePath];
  try {
    localStorage.setItem(getStorageKey(ctx), JSON.stringify(perFile));
  } catch { }
  window.dispatchEvent(new CustomEvent('gitcanvas:font-size-changed', { detail: { filePath, scope: 'file-reset' } }));
}

export function applyFontSizeToCard(ctx: CanvasContext, card: HTMLElement, filePath: string) {
  const size = getFileCodeFontSize(ctx, filePath);
  card.style.setProperty('--gitmaps-code-font-size', `${size}px`);
  const codeEls = card.querySelectorAll('.file-content-preview pre, .file-content-preview, .canvas-container, pre');
  codeEls.forEach((el) => {
    const node = el as HTMLElement;
    node.style.fontSize = `${size}px`;
    node.style.lineHeight = '1.35';
  });
}

export function applyFontSizeToAllCards(ctx: CanvasContext) {
  ctx.fileCards.forEach((card, filePath) => applyFontSizeToCard(ctx, card, filePath));
}
