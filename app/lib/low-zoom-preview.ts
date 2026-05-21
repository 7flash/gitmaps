import { getSettings } from './settings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREVIEWABLE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'jsonc',
  'css', 'scss', 'sass', 'less',
  'html', 'htm', 'xml', 'svg',
  'md', 'mdx', 'txt', 'log',
  'py', 'rs', 'go', 'rb', 'php', 'java', 'kt', 'swift',
  'c', 'cpp', 'cc', 'h', 'hpp', 'cs',
  'vue', 'svelte', 'astro',
  'toml', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'env',
  'sh', 'bash', 'zsh', 'fish',
  'sql', 'graphql', 'gql',
  'lock', 'gitignore', 'dockerignore',
]);

const KNOWN_EXTLESS_FILENAMES = new Set([
  'dockerfile', 'makefile', 'rakefile', 'gemfile', 'procfile',
  'license', 'readme', 'changelog', 'authors', 'contributors',
]);

const MAX_PREVIEW_BACKING_PIXELS = 1_500_000;
const MAX_PREVIEW_BACKING_DPR_FAR = 1.25;
const MAX_PREVIEW_BACKING_DPR_NEAR = 2.5;

// ---------------------------------------------------------------------------
// Logging / instrumentation
// ---------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type PreviewLogPayload = Record<string, unknown>;

const PREVIEW_LOG_NS = '[preview]';

function isPreviewDebugEnabled(): boolean {
  // Multiple opt-ins so it's easy to flip on without rebuilding.
  // - window.__PREVIEW_DEBUG__ = true
  // - localStorage.setItem('preview:debug', '1')
  try {
    const w = globalThis as any;
    if (w?.__PREVIEW_DEBUG__) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('preview:debug') === '1') return true;
  } catch {
    // ignore – SSR / sandboxed contexts
  }
  return false;
}

function previewLog(level: LogLevel, event: string, payload?: PreviewLogPayload) {
  // Warnings/errors always go through; debug/info are gated.
  if ((level === 'debug' || level === 'info') && !isPreviewDebugEnabled()) return;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (payload) {
    fn(`${PREVIEW_LOG_NS} ${event}`, payload);
  } else {
    fn(`${PREVIEW_LOG_NS} ${event}`);
  }
}

/**
 * Wraps a function so its inputs, outputs, duration, and any thrown error are
 * logged (gated by the preview debug flag for non-errors). Returns the original
 * value unchanged so call sites don't change.
 */
function measureFn<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => TResult,
  options?: {
    summarizeArgs?: (...args: TArgs) => PreviewLogPayload;
    summarizeResult?: (result: TResult) => PreviewLogPayload;
    warnIf?: (result: TResult, ...args: TArgs) => string | null;
  },
): (...args: TArgs) => TResult {
  return (...args: TArgs): TResult => {
    const debug = isPreviewDebugEnabled();
    const start = debug && typeof performance !== 'undefined' ? performance.now() : 0;

    try {
      const result = fn(...args);

      if (debug) {
        const durationMs = performance.now() - start;
        previewLog('debug', `${name}:ok`, {
          durationMs: Number(durationMs.toFixed(3)),
          ...(options?.summarizeArgs ? { args: options.summarizeArgs(...args) } : {}),
          ...(options?.summarizeResult ? { result: options.summarizeResult(result) } : {}),
        });
      }

      const warnReason = options?.warnIf?.(result, ...args);
      if (warnReason) {
        previewLog('warn', `${name}:warn`, {
          reason: warnReason,
          ...(options?.summarizeArgs ? { args: options.summarizeArgs(...args) } : {}),
        });
      }

      return result;
    } catch (err) {
      previewLog('error', `${name}:throw`, {
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
        ...(options?.summarizeArgs ? { args: options.summarizeArgs(...args) } : {}),
      });
      throw err;
    }
  };
}

function summarizeFile(file: any): PreviewLogPayload {
  if (!file) return { file: null };
  const contentStr = typeof file.content === 'string' ? file.content : null;
  return {
    path: file.path ?? null,
    ext: file.ext ?? null,
    status: file.status ?? null,
    isBinary: !!file.isBinary,
    contentType: typeof file.content,
    contentLen: contentStr ? contentStr.length : null,
    hunkCount: Array.isArray(file.hunks) ? file.hunks.length : 0,
    addedLinesSize: file.addedLines instanceof Set ? file.addedLines.size : null,
    deletedBeforeLineSize: file.deletedBeforeLine instanceof Map ? file.deletedBeforeLine.size : null,
  };
}

// ---------------------------------------------------------------------------
// Extension / filename resolution
// ---------------------------------------------------------------------------

function resolvePreviewFiletype(file: any): { ext: string; filename: string; previewable: boolean; reason?: string } {
  const rawPath = String(file?.path || '');
  const filename = (rawPath.split('/').pop() || '').toLowerCase();

  // Prefer explicit ext on the file object; otherwise derive from filename.
  // Important: only derive an extension when the filename actually contains a
  // dot, otherwise `split('.').pop()` returns the whole filename.
  let ext = String(file?.ext || '').toLowerCase();
  if (!ext) {
    ext = filename.includes('.') ? filename.split('.').pop() || '' : '';
  }

  if (PREVIEWABLE_EXTS.has(ext)) {
    return { ext, filename, previewable: true };
  }
  if (KNOWN_EXTLESS_FILENAMES.has(filename)) {
    return { ext, filename, previewable: true };
  }

  return {
    ext,
    filename,
    previewable: false,
    reason: ext ? `unsupported_ext:${ext}` : 'no_extension_and_unknown_filename',
  };
}

// ---------------------------------------------------------------------------
// Scale / layout
// ---------------------------------------------------------------------------

export function getLowZoomScale(zoom: number) {
  const clampedZoom = Math.max(0.08, Math.min(1, zoom));
  const settings = getSettings();

  const desiredScreenBody = settings.previewFontPx;
  const desiredScreenTitle = settings.previewFontPx + 2;
  const desiredScreenPadding = 10;
  const desiredScreenGap = 6;

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

// ---------------------------------------------------------------------------
// Diff maps (memoized per-file)
// ---------------------------------------------------------------------------

type PreviewRenderableLine = {
  text: string;
  tone: 'normal' | 'added' | 'deleted';
  sourceLine?: number;
};

type DiffMaps = {
  addedLines: Set<number>;
  deletedBeforeLine: Map<number, string[]>;
};

// Memoize diff parsing per file. The maps don't change between scroll frames,
// so recomputing them on every render is wasted work — especially for diff-heavy
// commits where this loop dominates the per-frame cost.
//
// We key on (file, hunks reference, status). If hunks identity changes (new
// commit selected for the same file object) the cache miss will rebuild.
const diffMapCache = new WeakMap<object, { hunks: unknown; status: unknown; maps: DiffMaps }>();

function computeDiffMaps(file: any): DiffMaps {
  const addedLines = new Set<number>(
    file?.addedLines instanceof Set ? Array.from(file.addedLines as Set<number>) : [],
  );
  const deletedBeforeLine = new Map<number, string[]>(
    file?.deletedBeforeLine instanceof Map
      ? Array.from((file.deletedBeforeLine as Map<number, string[]>).entries())
      : [],
  );

  if ((addedLines.size === 0 && deletedBeforeLine.size === 0) && Array.isArray(file?.hunks)) {
    for (const hunk of file.hunks) {
      let newLine = hunk?.newStart || 1;
      let pendingDeleted: string[] = [];
      for (const line of hunk?.lines || []) {
        if (line?.type === 'add') {
          addedLines.add(newLine);
          if (pendingDeleted.length > 0) {
            const existing = deletedBeforeLine.get(newLine) || [];
            deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
            pendingDeleted = [];
          }
          newLine += 1;
        } else if (line?.type === 'del') {
          pendingDeleted.push(String(line?.content || ''));
        } else {
          if (pendingDeleted.length > 0) {
            const existing = deletedBeforeLine.get(newLine) || [];
            deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
            pendingDeleted = [];
          }
          newLine += 1;
        }
      }
      if (pendingDeleted.length > 0) {
        const existing = deletedBeforeLine.get(newLine) || [];
        deletedBeforeLine.set(newLine, existing.concat(pendingDeleted));
      }
    }
  }

  return { addedLines, deletedBeforeLine };
}

const getPreviewDiffMaps = measureFn(
  'getPreviewDiffMaps',
  function getPreviewDiffMapsImpl(file: any): DiffMaps {
    if (file && typeof file === 'object') {
      const cached = diffMapCache.get(file);
      if (cached && cached.hunks === file.hunks && cached.status === file.status) {
        return cached.maps;
      }
      const maps = computeDiffMaps(file);
      diffMapCache.set(file, { hunks: file.hunks, status: file.status, maps });
      return maps;
    }
    return computeDiffMaps(file);
  },
  {
    summarizeArgs: (file) => ({ file: summarizeFile(file) }),
    summarizeResult: (r) => ({ added: r.addedLines.size, deletedBuckets: r.deletedBeforeLine.size }),
  },
);

// ---------------------------------------------------------------------------
// Renderable lines
// ---------------------------------------------------------------------------

const LOADING_LINE: PreviewRenderableLine = { text: 'Loading…', tone: 'normal' };

export const getPreviewRenderableLines = measureFn(
  'getPreviewRenderableLines',
  function getPreviewRenderableLinesImpl(file: any, scrollTop: number): PreviewRenderableLine[] {
    if (!file) {
      previewLog('warn', 'getPreviewRenderableLines:bail', { reason: 'no_file' });
      return [];
    }
    if (file.isBinary) {
      previewLog('debug', 'getPreviewRenderableLines:bail', { reason: 'binary', path: file.path });
      return [];
    }

    const previewContent =
      typeof file.content === 'string'
        ? file.content
        : typeof file.previewContent === 'string'
          ? file.previewContent
          : null;

    if (previewContent == null) {
      return [LOADING_LINE];
    }

    if (typeof previewContent !== 'string') {
      previewLog('warn', 'getPreviewRenderableLines:bail', {
        reason: 'content_not_string',
        path: file.path,
        contentType: typeof previewContent,
        constructor: (previewContent as any)?.constructor?.name ?? null,
        keys:
          typeof previewContent === 'object' && previewContent !== null
            ? Object.keys(previewContent as object).slice(0, 10)
            : null,
      });
      return [];
    }
    if (previewContent.length === 0) {
      previewLog('debug', 'getPreviewRenderableLines:bail', { reason: 'empty_content', path: file.path });
      return [];
    }

    const { previewable, ext, filename, reason } = resolvePreviewFiletype(file);
    if (!previewable) {
      previewLog('warn', 'getPreviewRenderableLines:bail', {
        reason: reason || 'not_previewable',
        path: file.path,
        ext,
        filename,
      });
      return [];
    }

    const normalized = previewContent.replace(/\t/g, '  ');
    const lines = normalized.split('\n');
    const approxLineHeight = 20;

    // Clamp scroll so a stale scrollTop from a longer file can't push us past
    // the end of a shorter one (otherwise the loop yields nothing and the
    // canvas falls back to "Preview unavailable").
    const maxStart = Math.max(0, lines.length - 1);
    const startLine = Math.min(maxStart, Math.max(0, Math.floor(scrollTop / approxLineHeight)));

    const { addedLines, deletedBeforeLine } = getPreviewDiffMaps(file);
    const out: PreviewRenderableLine[] = [];

    for (let i = startLine; i < lines.length; i += 1) {
      const lineNum = i + 1;
      const deleted = deletedBeforeLine.get(lineNum) || [];
      for (const deletedLine of deleted) {
        out.push({
          text: `- ${String(deletedLine).replace(/\t/g, '  ')}`,
          tone: 'deleted',
          sourceLine: lineNum,
        });
      }
      out.push({
        text: lines[i],
        tone:
          file?.status === 'added' || addedLines.has(lineNum)
            ? 'added'
            : file?.status === 'deleted'
              ? 'deleted'
              : 'normal',
        sourceLine: lineNum,
      });
    }

    return out;
  },
  {
    summarizeArgs: (file, scrollTop) => ({ file: summarizeFile(file), scrollTop }),
    summarizeResult: (r) => ({ count: r.length }),
    warnIf: (result, file) => {
      if (
        result.length === 0 &&
        file &&
        !file.isBinary &&
        (typeof file.content === 'string' && file.content.length > 0) ||
        (typeof file.previewContent === 'string' && file.previewContent.length > 0)
      ) {
        return 'returned_empty_for_nonempty_file';
      }
      return null;
    },
  },
);

export function getLowZoomPreviewText(file: any, scrollTop: number): string {
  return getPreviewRenderableLines(file, scrollTop).map((line) => line.text).join('\n').trim();
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function getPreviewRelativeDirectoryPath(path: string): string {
  const normalized = String(path || '').replace(/\\+/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) return 'root';
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return 'root';
  return parts.slice(0, -1).join(' / ');
}

export function wrapPreviewText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const safeMaxChars = Math.max(8, Math.floor(maxCharsPerLine));
  const safeMaxLines = Math.max(1, Math.floor(maxLines));
  const sourceLines = String(text || '').split('\n');
  const out: string[] = [];

  for (const sourceLine of sourceLines) {
    if (sourceLine.length === 0) {
      out.push('');
      if (out.length >= safeMaxLines) return out.slice(0, safeMaxLines);
      continue;
    }

    for (let i = 0; i < sourceLine.length; i += safeMaxChars) {
      out.push(sourceLine.slice(i, i + safeMaxChars));
      if (out.length >= safeMaxLines) return out.slice(0, safeMaxLines);
    }
  }

  return out.slice(0, safeMaxLines);
}

function estimatePhysicalPreviewLineCapacity(height: number, zoom: number): number {
  const scale = getLowZoomScale(zoom);
  const titleLines = zoom >= 0.35 ? 2 : 1;
  const available = Math.max(
    scale.bodyLineHeight * 2,
    height - scale.padding * 2 - scale.titleLineHeight * titleLines - scale.bodyFont - scale.gap * 3,
  );
  return Math.max(2, Math.floor(available / scale.bodyLineHeight));
}

export function estimatePreviewLineCapacity(height: number, zoom: number): number {
  return estimatePhysicalPreviewLineCapacity(height, zoom);
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

function estimateVisibleRawLines(height: number, zoom: number) {
  const wrappedVisibleLines = Math.max(1, estimatePreviewLineCapacity(height, zoom));
  return Math.max(1, Math.floor(wrappedVisibleLines * 0.55));
}

export function estimatePreviewMaxScroll(file: any, height: number, zoom: number): number {
  if (!file || typeof file.content !== 'string') return 0;
  const totalLines = file.content.split('\n').length;
  const visibleLines = estimateVisibleRawLines(height, zoom);
  return Math.max(0, (totalLines - visibleLines) * 20);
}

export function getPreviewScrollMetrics(file: any, height: number, zoom: number, scrollTop: number) {
  const contentStr = typeof file?.content === 'string' ? file.content : '';
  const totalLines = Math.max(1, contentStr.split('\n').length);
  const visibleLines = Math.max(1, estimateVisibleRawLines(height, zoom));
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
  const { addedLines, deletedBeforeLine } = getPreviewDiffMaps(file);

  if (file?.status === 'added') {
    markers.push({ ratio: 0, color: '#22c55e', height: 1 });
    return markers;
  }
  if (file?.status === 'deleted') {
    markers.push({ ratio: 0, color: '#ef4444', height: 1 });
    return markers;
  }

  for (const line of addedLines) {
    markers.push({ ratio: Math.max(0, Math.min(1, (line - 1) / safeTotal)), color: '#22c55e' });
  }
  for (const line of deletedBeforeLine.keys()) {
    markers.push({ ratio: Math.max(0, Math.min(1, (line - 1) / safeTotal)), color: '#ef4444' });
  }
  return markers;
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------

function getPreviewBackingScale(width: number, height: number, zoom: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const deviceDpr = Math.max(1, globalThis.devicePixelRatio || 1);
  const areaLimitedDpr = Math.sqrt(MAX_PREVIEW_BACKING_PIXELS / (safeWidth * safeHeight));
  const zoomT = Math.max(0, Math.min(1, (Math.max(0.08, zoom) - 0.35) / (1.5 - 0.35)));
  const zoomAwareCap = MAX_PREVIEW_BACKING_DPR_FAR + (MAX_PREVIEW_BACKING_DPR_NEAR - MAX_PREVIEW_BACKING_DPR_FAR) * zoomT;
  return Math.max(1, Math.min(deviceDpr, zoomAwareCap, areaLimitedDpr));
}

export function releaseLowZoomPreviewCanvas(canvas: HTMLCanvasElement | null | undefined) {
  if (!canvas) return;
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.width = '1px';
  canvas.style.height = '1px';
}

export const renderLowZoomPreviewCanvas = measureFn(
  'renderLowZoomPreviewCanvas',
  function renderLowZoomPreviewCanvasImpl(
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
    const dpr = getPreviewBackingScale(width, height, zoom);
    const scale = getLowZoomScale(zoom);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      previewLog('error', 'renderLowZoomPreviewCanvas:no_context', { path });
      return;
    }

    const targetWidth = Math.max(1, Math.floor(width * dpr));
    const targetHeight = Math.max(1, Math.floor(height * dpr));
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
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
    const maxTitleLines = zoom <= 0.18 ? 3 : 2;
    const titleLines = wrapPreviewText(title, estimateTitleCharsPerLine(width, zoom), maxTitleLines);
    titleLines.forEach((line, index) => {
      ctx.fillText(trimToWidth(ctx, line, maxTextWidth), leftInset, topInset + index * scale.titleLineHeight);
    });

    const subtitleY = topInset + titleLines.length * scale.titleLineHeight + scale.gap * 0.65;
    const subtitleFont = Math.max(scale.bodyFont * 0.82, 6 / Math.max(zoom, 0.08));
    ctx.font = `${subtitleFont}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(226,232,240,0.72)';
    const subtitle = getPreviewRelativeDirectoryPath(path);
    ctx.fillText(trimToWidth(ctx, subtitle, maxTextWidth), leftInset, subtitleY);

    const previewY = subtitleY + subtitleFont + scale.gap;
    const previewLines = getPreviewRenderableLines(file, scrollTop);
    const maxCharsPerLine = estimatePreviewCharsPerLine(width, zoom);
    const maxVisibleLines = estimatePreviewLineCapacity(height, zoom);
    const wrapped: Array<{ text: string; tone: 'normal' | 'added' | 'deleted' }> = [];

    for (const line of previewLines) {
      const parts = wrapPreviewText(line.text, maxCharsPerLine, Math.max(1, maxVisibleLines - wrapped.length));
      for (const part of parts) {
        wrapped.push({ text: part, tone: line.tone });
        if (wrapped.length >= maxVisibleLines) break;
      }
      if (wrapped.length >= maxVisibleLines) break;
    }

    if (wrapped.length === 0) {
      previewLog('warn', 'renderLowZoomPreviewCanvas:fallback', {
        path,
        reason: previewLines.length === 0 ? 'no_renderable_lines' : 'wrap_produced_nothing',
        previewLineCount: previewLines.length,
        maxCharsPerLine,
        maxVisibleLines,
        width,
        height,
        zoom,
        file: summarizeFile(file),
      });
      wrapped.push({ text: 'Preview unavailable', tone: 'normal' });
    }

    ctx.font = `${scale.bodyFont}px "JetBrains Mono", monospace`;

    const fadeStart = Math.max(previewY, height - scale.bodyLineHeight * 2.2);
    const bodyHeight = Math.max(scale.bodyLineHeight * 2, height - previewY - scale.padding);
    const fadeRatio = Math.max(0, (fadeStart - previewY) / Math.max(1, bodyHeight));

    wrapped.forEach((line, index) => {
      const y = previewY + index * scale.bodyLineHeight;
      if (y > height - scale.padding) return;

      const t = Math.max(0, Math.min(1, (y - previewY) / Math.max(1, bodyHeight)));
      const alpha = t <= fadeRatio ? 1 : Math.max(0, 1 - ((t - fadeRatio) / Math.max(0.0001, 1 - fadeRatio)));

      if (line.tone === 'added') {
        ctx.fillStyle = `rgba(34,197,94,${0.12 * alpha})`;
        ctx.fillRect(leftInset - 4, y, maxTextWidth + 4, scale.bodyLineHeight - 1);
        ctx.fillStyle = `rgba(134,239,172,${0.98 * alpha})`;
      } else if (line.tone === 'deleted') {
        ctx.fillStyle = `rgba(239,68,68,${0.1 * alpha})`;
        ctx.fillRect(leftInset - 4, y, maxTextWidth + 4, scale.bodyLineHeight - 1);
        ctx.fillStyle = `rgba(252,165,165,${0.96 * alpha})`;
      } else {
        ctx.fillStyle = `rgba(226,232,240,${0.92 * alpha})`;
      }

      ctx.fillText(trimToWidth(ctx, line.text, maxTextWidth), leftInset, y);
    });
  },
  {
    summarizeArgs: (_canvas, params) => ({
      path: params.path,
      width: params.width,
      height: params.height,
      zoom: params.zoom,
      scrollTop: params.scrollTop,
      file: summarizeFile(params.file),
    }),
  },
);

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function trimToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out;
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
