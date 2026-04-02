const PREVIEWABLE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'html', 'md', 'py', 'rs', 'go', 'vue', 'svelte', 'toml', 'yaml', 'yml', 'sh', 'sql', 'txt'
]);

export function getLowZoomScale(zoom: number) {
  const clampedZoom = Math.max(0.08, Math.min(0.25, zoom));
  const progress = (0.25 - clampedZoom) / (0.25 - 0.08);
  const desiredScreenTitle = 14 + progress * 6;
  const desiredScreenBody = 9 + progress * 4;
  return {
    titleFont: desiredScreenTitle / clampedZoom,
    titleLineHeight: (desiredScreenTitle * 1.08) / clampedZoom,
    bodyFont: desiredScreenBody / clampedZoom,
    bodyLineHeight: (desiredScreenBody * 1.45) / clampedZoom,
    padding: (12 + progress * 6) / clampedZoom,
    gap: (7 + progress * 3) / clampedZoom,
    radius: 10 / clampedZoom,
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

export function wrapPreviewText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const safeMaxChars = Math.max(8, Math.floor(maxCharsPerLine));
  const safeMaxLines = Math.max(1, Math.floor(maxLines));
  const sourceLines = String(text || '').split('\n');
  const out: string[] = [];

  for (const sourceLine of sourceLines) {
    const words = sourceLine.length === 0 ? [''] : sourceLine.split(/(\s+)/).filter(Boolean);
    let current = '';

    for (const part of words) {
      if (part.length > safeMaxChars) {
        if (current.trim().length > 0) {
          out.push(current.trimEnd());
          if (out.length >= safeMaxLines) return ellipsizeWrappedLines(out, safeMaxLines);
          current = '';
        }
        for (let i = 0; i < part.length; i += safeMaxChars) {
          out.push(part.slice(i, i + safeMaxChars));
          if (out.length >= safeMaxLines) return ellipsizeWrappedLines(out, safeMaxLines);
        }
        continue;
      }

      if ((current + part).length > safeMaxChars && current.length > 0) {
        out.push(current.trimEnd());
        if (out.length >= safeMaxLines) return ellipsizeWrappedLines(out, safeMaxLines);
        current = part.trimStart();
      } else {
        current += part;
      }
    }

    if (current.length > 0 || sourceLine.length === 0) {
      out.push(current.trimEnd());
      if (out.length >= safeMaxLines) return ellipsizeWrappedLines(out, safeMaxLines);
    }
  }

  return out.slice(0, safeMaxLines);
}

function ellipsizeWrappedLines(lines: string[], maxLines: number) {
  const sliced = lines.slice(0, maxLines);
  if (sliced.length === 0) return sliced;
  const last = sliced[sliced.length - 1].replace(/[\s.…]+$/g, '');
  sliced[sliced.length - 1] = `${last}…`;
  return sliced;
}

export function estimatePreviewLineCapacity(height: number, zoom: number): number {
  const scale = getLowZoomScale(zoom);
  const available = Math.max(scale.bodyLineHeight, height - scale.padding * 2 - scale.titleLineHeight * 2 - scale.bodyFont - scale.gap * 4);
  return Math.max(2, Math.floor(available / scale.bodyLineHeight));
}

export function estimateTitleCharsPerLine(width: number, zoom: number): number {
  const scale = getLowZoomScale(zoom);
  const available = Math.max(80, width - scale.padding * 2 - Math.max(14, width * 0.02));
  const avgCharWidth = Math.max(7, scale.titleFont * 0.58);
  return Math.max(8, Math.floor(available / avgCharWidth));
}

export function estimatePreviewCharsPerLine(width: number, zoom: number): number {
  const scale = getLowZoomScale(zoom);
  const available = Math.max(60, width - scale.padding * 2 - Math.max(14, width * 0.02));
  const avgCharWidth = Math.max(6, scale.bodyFont * 0.6);
  return Math.max(8, Math.floor(available / avgCharWidth));
}

export function renderLowZoomPreviewCanvas(
  canvas: HTMLCanvasElement,
  params: {
    path: string;
    file: any;
    width: number;
    height: number;
    zoom: number;
    scrollTop: number;
    accentColor: string;
    isChanged: boolean;
  },
) {
  const { path, file, width, height, zoom, scrollTop, accentColor } = params;
  const dpr = (globalThis.devicePixelRatio || 1);
  const scale = getLowZoomScale(zoom);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(15,23,42,0.96)');
  gradient.addColorStop(1, 'rgba(2,6,23,0.96)');
  ctx.fillStyle = gradient;
  roundRect(ctx, 0, 0, width, height, Math.max(6, scale.radius));
  ctx.fill();

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, Math.max(10, width * 0.02), height);

  const leftInset = scale.padding + Math.max(14, width * 0.02);
  const topInset = scale.padding;
  const maxTextWidth = Math.max(40, width - leftInset - scale.padding);

  ctx.textBaseline = 'top';
  ctx.font = `700 ${scale.titleFont}px "JetBrains Mono", monospace`;
  ctx.fillStyle = '#f8fafc';
  const title = path.split('/').pop() || path;
  const titleLines = wrapPreviewText(title, estimateTitleCharsPerLine(width, zoom), 2);
  titleLines.forEach((line, index) => {
    ctx.fillText(trimToWidth(ctx, line, maxTextWidth), leftInset, topInset + index * scale.titleLineHeight);
  });

  const subtitleY = topInset + titleLines.length * scale.titleLineHeight + scale.gap * 0.8;
  ctx.font = `${Math.max(scale.bodyFont * 0.8, 9 / Math.max(zoom, 0.08))}px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(226,232,240,0.72)';
  const pathParts = path.split('/');
  const subtitle = pathParts.length > 1 ? pathParts.slice(Math.max(0, pathParts.length - 3), -1).join(' / ') : 'root';
  ctx.fillText(trimToWidth(ctx, subtitle, maxTextWidth), leftInset, subtitleY);

  const previewY = subtitleY + Math.max(scale.bodyFont * 0.8, 9 / Math.max(zoom, 0.08)) + scale.gap * 1.35;
  const rawPreview = getLowZoomPreviewText(file, scrollTop) || 'Preview unavailable';
  const wrapped = wrapPreviewText(
    rawPreview,
    estimatePreviewCharsPerLine(width, zoom),
    estimatePreviewLineCapacity(height, zoom),
  );

  ctx.font = `${scale.bodyFont}px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(226,232,240,0.92)';

  const fadeStart = Math.max(previewY, height - scale.bodyLineHeight * 2.2);
  const bodyHeight = Math.max(scale.bodyLineHeight * 2, height - previewY - scale.padding);
  const mask = ctx.createLinearGradient(0, previewY, 0, previewY + bodyHeight);
  mask.addColorStop(0, 'rgba(226,232,240,0.92)');
  mask.addColorStop(Math.max(0, (fadeStart - previewY) / Math.max(1, bodyHeight)), 'rgba(226,232,240,0.92)');
  mask.addColorStop(1, 'rgba(226,232,240,0)');
  ctx.fillStyle = mask;

  wrapped.forEach((line, index) => {
    const y = previewY + index * scale.bodyLineHeight;
    if (y > height - scale.padding) return;
    ctx.fillText(line, leftInset, y);
  });
}

function trimToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
