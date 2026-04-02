const PREVIEWABLE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'html', 'md', 'py', 'rs', 'go', 'vue', 'svelte', 'toml', 'yaml', 'yml', 'sh', 'sql', 'txt'
]);

export function getLowZoomScale(zoom: number) {
  const clampedZoom = Math.max(0.08, Math.min(0.25, zoom));
  const progress = (0.25 - clampedZoom) / (0.25 - 0.08);
  const desiredScreenTitle = 10 + progress * 4;
  const desiredScreenBody = 8 + progress * 4;
  return {
    titleFont: desiredScreenTitle / clampedZoom,
    bodyFont: desiredScreenBody / clampedZoom,
    bodyLineHeight: (desiredScreenBody * 1.45) / clampedZoom,
    padding: (10 + progress * 4) / clampedZoom,
    gap: (6 + progress * 3) / clampedZoom,
    radius: 8 / clampedZoom,
  };
}

export function getLowZoomPreviewText(file: any, scrollTop: number): string {
  if (!file || file.isBinary || !file.content) return '';

  const ext = (file.ext || file.path?.split('.').pop() || '').toLowerCase();
  if (!PREVIEWABLE_EXTS.has(ext)) return '';

  const normalized = String(file.content).replace(/\t/g, '  ');
  const lines = normalized.split('\n');
  const approxLineHeight = 20;
  const startLine = Math.max(0, Math.floor(scrollTop / approxLineHeight));
  return lines.slice(startLine, startLine + 60).join('\n').trim();
}
