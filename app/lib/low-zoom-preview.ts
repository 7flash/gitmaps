import { getSettings } from './settings';

const PREVIEWABLE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'html', 'md', 'py', 'rs', 'go', 'vue', 'svelte', 'toml', 'yaml', 'yml', 'sh', 'sql', 'txt'
]);

export function getLowZoomScale(zoom: number) {
  const clampedZoom = Math.max(0.08, Math.min(1, zoom));
  const progress = (clampedZoom - 0.08) / (1 - 0.08);
  const settings = getSettings();

  const desiredScreenTitle = settings.previewFarTitlePx + progress * (settings.previewNearTitlePx - settings.previewFarTitlePx);
  const desiredScreenBody = 5.5 + progress * 6.5;
  const desiredScreenPadding = 6 + progress * 8;
  const desiredScreenGap = 4 + progress * 4;

  return {
    titleFont: desiredScreenTitle / clampedZoom,
    titleLineHeight: (desiredScreenTitle * 1.08) / clampedZoom,
    bodyFont: desiredScreenBody / clampedZoom,
    bodyLineHeight: (desiredScreenBody * 1.35) / clampedZoom,
    padding: desiredScreenPadding / clampedZoom,
    gap: desiredScreenGap / clampedZoom,
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
  return lines.slice(startLine).join('\n').trim();
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
  const settings = getSettings();
  const titleLines = zoom >= 0.35 ? 2 : 1;
  const available = Math.max(
    scale.bodyLineHeight * 2,
    height - scale.padding * 2 - scale.titleLineHeight * titleLines - scale.bodyFont - scale.gap * 3,
  );
  const progress = (Math.max(0.08, Math.min(1, zoom)) - 0.08) / (1 - 0.08);
  const targetLines = settings.previewFarLines + progress * (settings.previewNearLines - settings.previewFarLines);
  return Math.max(Math.round(targetLines), Math.floor(available / scale.bodyLineHeight));
}

export function estimateTitleCharsPerLine(width: number, zoom: number): number {
  const scale = getLowZoomScale(zoom);
  const available = Math.max(120, width - scale.padding * 2 - Math.max(12, width * 0.018));
  const avgCharWidth = Math.max(5.5, scale.titleFont * 0.56);
  return Math.max(12, Math.floor(available / avgCharWidth));
}

export function estimatePreviewCharsPerLine(width: number, zoom: number): number {
  const scale = getLowZoomScale(zoom);
  const available = Math.max(100, width - scale.padding * 2 - Math.max(12, width * 0.018));
  const avgCharWidth = Math.max(5, scale.bodyFont * 0.58);
  return Math.max(10, Math.floor(available / avgCharWidth));
}

export function estimatePreviewMaxScroll(file: any, height: number, zoom: number): number {
  if (!file || !file.content) return 0;
  const totalLines = String(file.content).split('\n').length;
  const visibleLines = estimatePreviewLineCapacity(height, zoom);
  return Math.max(0, (totalLines - visibleLines) * 20);
}

export function getPreviewScrollMetrics(file: any, height: number, zoom: number, scrollTop: number) {
  const totalLines = Math.max(1, String(file?.content || '').split('\n').length);
  const visibleLines = Math.max(1, estimatePreviewLineCapacity(height, zoom));
  const maxScroll = Math.max(0, (totalLines - visibleLines) * 20);
  const trackPadding = 10;
  const trackHeight = Math.max(24, height - trackPadding * 2);
  const thumbHeight = Math.max(18, (visibleLines / totalLines) * trackHeight);
  const thumbTravel = Math.max(0, trackHeight - thumbHeight);
  const thumbY = trackPadding + (maxScroll > 0 ? (scrollTop / maxScroll) * thumbTravel : 0);
  return { totalLines, visibleLines, maxScroll, trackPadding, trackHeight, thumbHeight, thumbY };
}

export function collectPreviewDiffMarkers(file: any, totalLines: number) {
  const markers: Array<{ ratio: number; color: string; height?: number }> = [];
  const safeTotal = Math.max(1, totalLines);
  const added = file?.addedLines instanceof Set ? Array.from(file.addedLines) : [];
  const deletedBefore = file?.deletedBeforeLine instanceof Map ? Array.from(file.deletedBeforeLine.keys()) : [];

  if (file?.status === 'added') {
    markers.push({ ratio: 0, color: '#22c55e', height: 1 });
    return markers;
  }
  if (file?.status === 'deleted') {
    markers.push({ ratio: 0, color: '#ef4444', height: 1 });
    return markers;
  }

  for (const line of added) {
    markers.push({ ratio: Math.max(0, Math.min(1, (line - 1) / safeTotal)), color: '#22c55e' });
  }
  for (const line of deletedBefore) {
    markers.push({ ratio: Math.max(0, Math.min(1, (line - 1) / safeTotal)), color: '#ef4444' });
  }
  return markers;
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
  const scrollMetrics = getPreviewScrollMetrics(file, height, zoom, scrollTop);

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

  const accentWidth = Math.max(6, width * 0.012);
  const scrollbarWidth = 7;
  const markerLaneWidth = 8;
  const rightRailWidth = scrollbarWidth + markerLaneWidth + 12;
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, accentWidth, height);

  const leftInset = scale.padding + accentWidth + scale.gap * 0.8;
  const topInset = scale.padding;
  const maxTextWidth = Math.max(40, width - leftInset - scale.padding - rightRailWidth);

  ctx.textBaseline = 'top';
  ctx.font = `700 ${scale.titleFont}px "JetBrains Mono", monospace`;
  ctx.fillStyle = '#f8fafc';
  const title = path.split('/').pop() || path;
  const maxTitleLines = zoom >= 0.35 ? 2 : 1;
  const titleLines = wrapPreviewText(title, estimateTitleCharsPerLine(width, zoom), maxTitleLines);
  titleLines.forEach((line, index) => {
    ctx.fillText(trimToWidth(ctx, line, maxTextWidth), leftInset, topInset + index * scale.titleLineHeight);
  });

  const subtitleY = topInset + titleLines.length * scale.titleLineHeight + scale.gap * 0.65;
  const subtitleFont = Math.max(scale.bodyFont * 0.82, 6 / Math.max(zoom, 0.08));
  ctx.font = `${subtitleFont}px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(226,232,240,0.72)';
  const pathParts = path.split('/');
  const subtitle = pathParts.length > 1 ? pathParts.slice(Math.max(0, pathParts.length - 2), -1).join(' / ') : 'root';
  ctx.fillText(trimToWidth(ctx, subtitle, maxTextWidth), leftInset, subtitleY);

  const previewY = subtitleY + subtitleFont + scale.gap;
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

  const trackX = width - scrollbarWidth - 5;
  const markerX = trackX - markerLaneWidth - 4;
  const trackY = scrollMetrics.trackPadding;
  const trackHeight = scrollMetrics.trackHeight;

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, markerX, trackY, markerLaneWidth, trackHeight, 3);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, trackX, trackY, scrollbarWidth, trackHeight, scrollbarWidth / 2);
  ctx.fill();

  const markers = collectPreviewDiffMarkers(file, scrollMetrics.totalLines);
  for (const marker of markers) {
    const markerHeight = marker.height === 1 ? trackHeight : 5;
    const y = marker.height === 1 ? trackY : trackY + marker.ratio * Math.max(0, trackHeight - markerHeight);
    ctx.fillStyle = marker.color;
    roundRect(ctx, markerX, Math.max(trackY, y), markerLaneWidth, markerHeight, 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(196,181,253,0.96)';
  roundRect(ctx, trackX, scrollMetrics.thumbY, scrollbarWidth, scrollMetrics.thumbHeight, scrollbarWidth / 2);
  ctx.fill();
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
