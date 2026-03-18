/**
 * Virtual Files — Transclusion-based compression for large files
 *
 * Detects repeating content in large files and extracts it into virtual cards.
 * Virtual cards are anchored near the original file and linked on hover.
 */

import type { CanvasContext } from './context';
import { escapeHtml } from './utils';

export interface VirtualSegment {
  id: string;
  content: string;
  occurrences: number;
  lineNumbers: number[];
  type: 'prefix' | 'repeating' | 'boilerplate';
}

export interface VirtualFile {
  path: string;
  originalPath: string;
  segments: VirtualSegment[];
  compressionRatio: number;
}

const MIN_LINES = 120;
const MIN_BYTES = 12_000;
const MAX_VIRTUAL_FILES = 6;
const MAX_SEGMENTS_PER_FILE = 2;
const VIRTUAL_CARD_WIDTH = 320;
const VIRTUAL_CARD_HEIGHT = 200;
const VIRTUAL_CARD_GAP_X = 36;
const VIRTUAL_CARD_GAP_Y = 22;

const EXCLUDED_PATH_PATTERNS = [
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /(^|\/)\.docs\//,
  /(^|\/)docs\//,
  /(^|\/)tests?\//,
  /(^|\/)__tests__\//,
  /(^|\/)packages\/galaxydraw\/dist\//,
  /(^|\/)node_modules\//,
  /(^|\/)app\/globals\.css$/,
  /(^|\/)app\/styles\/main\.css$/,
  /(^|\/)app\/layout\.tsx$/,
  /\.test\.[^.]+$/,
  /\.spec\.[^.]+$/,
  /-lock\./,
];

const DEPRIORITIZED_EXTS = new Set(['css', 'scss', 'less', 'md', 'txt', 'svg', 'json']);

// ─── Detection ───────────────────────────────────────────

/**
 * Analyze file content for repeating patterns.
 */
export function detectVirtualSegments(content: string, filePath: string): VirtualSegment[] {
  const lines = content.split('\n');
  const segments: VirtualSegment[] = [];

  if (lines.length < 50) return segments;

  segments.push(...detectCommonPrefixes(lines, filePath));
  segments.push(...detectRepeatingBlocks(lines, filePath));

  segments.sort((a, b) => compressionScore(b) - compressionScore(a));

  const deduped: VirtualSegment[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const key = `${segment.type}:${segment.content.slice(0, 160)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(segment);
    if (deduped.length >= 5) break;
  }

  return deduped;
}

function compressionScore(segment: VirtualSegment): number {
  const base = segment.content.length * Math.max(segment.occurrences - 1, 1);
  const typeBoost = segment.type === 'repeating' ? 1.35 : 1;
  const occurrenceBoost = Math.min(segment.occurrences / 8, 2.5);
  return Math.round(base * typeBoost * occurrenceBoost);
}

/**
 * Detect common line prefixes (e.g. timestamps / log prefixes).
 */
function detectCommonPrefixes(lines: string[], filePath: string): VirtualSegment[] {
  const prefixMap = new Map<string, number[]>();
  const MIN_PREFIX_LENGTH = 16;
  const MAX_PREFIX_LENGTH = 80;
  const MIN_OCCURRENCES = 10;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < MIN_PREFIX_LENGTH) continue;

    for (let len = MIN_PREFIX_LENGTH; len <= Math.min(MAX_PREFIX_LENGTH, line.length); len += 8) {
      const prefix = line.substring(0, len);
      if (!looksCompressiblePrefix(prefix)) continue;
      if (!prefixMap.has(prefix)) prefixMap.set(prefix, []);
      prefixMap.get(prefix)!.push(i);
    }
  }

  const segments: VirtualSegment[] = [];
  let idCounter = 0;

  for (const [prefix, lineNumbers] of prefixMap.entries()) {
    if (lineNumbers.length < MIN_OCCURRENCES) continue;
    segments.push({
      id: `virtual-${filePath.replace(/[^a-z0-9]/gi, '-')}-prefix-${idCounter++}`,
      content: prefix,
      occurrences: lineNumbers.length,
      lineNumbers,
      type: 'prefix',
    });
  }

  return segments;
}

function looksCompressiblePrefix(prefix: string): boolean {
  // Avoid generating cards for boring indentation or very low-signal prefixes.
  const trimmed = prefix.trim();
  if (trimmed.length < 12) return false;
  if (/^[\[{(<\-_=:.\s]+$/.test(prefix)) return false;
  if (/^[A-Z_-]+:?$/.test(trimmed)) return false;
  if (/^[a-z0-9_-]+$/i.test(trimmed) && trimmed.length < 18) return false;
  const alphaCount = (trimmed.match(/[A-Za-z]/g) || []).length;
  if (alphaCount < 4) return false;
  return /[A-Za-z0-9]/.test(prefix);
}

/**
 * Detect repeating blocks of text.
 */
function detectRepeatingBlocks(lines: string[], filePath: string): VirtualSegment[] {
  const blockMap = new Map<string, number[]>();
  const BLOCK_SIZE = 4;
  const MIN_OCCURRENCES = 3;

  for (let i = 0; i <= lines.length - BLOCK_SIZE; i++) {
    const block = lines.slice(i, i + BLOCK_SIZE).join('\n');
    if (block.length < 80) continue;
    if (!blockMap.has(block)) blockMap.set(block, []);
    blockMap.get(block)!.push(i);
  }

  const segments: VirtualSegment[] = [];
  let idCounter = 0;

  for (const [block, lineNumbers] of blockMap.entries()) {
    if (lineNumbers.length < MIN_OCCURRENCES) continue;
    segments.push({
      id: `virtual-${filePath.replace(/[^a-z0-9]/gi, '-')}-block-${idCounter++}`,
      content: block,
      occurrences: lineNumbers.length,
      lineNumbers,
      type: 'repeating',
    });
  }

  return segments;
}

// ─── Lifecycle / placement ───────────────────────────────

export function clearVirtualCards(ctx?: CanvasContext): void {
  document.querySelectorAll('.virtual-card').forEach((card) => card.remove());
  const overlay = (ctx?.svgOverlay || document.getElementById('connectionsOverlay')) as SVGSVGElement | null;
  if (overlay) {
    overlay.querySelectorAll('.virtual-connection').forEach((line) => line.remove());
  }
}

function getOriginalPlacement(ctx: CanvasContext, originalFilePath: string) {
  const mounted = ctx.fileCards.get(originalFilePath);
  if (mounted) {
    return {
      x: parseFloat(mounted.style.left) || 0,
      y: parseFloat(mounted.style.top) || 0,
      w: mounted.offsetWidth || 580,
      h: mounted.offsetHeight || 700,
    };
  }

  const deferred = ctx.deferredCards.get(originalFilePath);
  if (deferred) {
    return {
      x: deferred.x,
      y: deferred.y,
      w: deferred.size?.width || 580,
      h: deferred.size?.height || 700,
    };
  }

  return null;
}

function shouldCreateVirtualCards(file: any): boolean {
  if (!file?.content || typeof file.content !== 'string') return false;
  if (file.isBinary || file.type !== 'file') return false;
  const normalizedPath = String(file.path || '').replace(/\\/g, '/');
  if (EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath))) return false;
  const lineCount = file.lines || file.content.split('\n').length;
  const byteSize = file.size || file.content.length;
  return lineCount >= MIN_LINES || byteSize >= MIN_BYTES;
}

function getFilePriorityScore(file: any): number {
  const normalizedPath = String(file.path || '').replace(/\\/g, '/');
  const ext = String(file.ext || '').toLowerCase();
  let score = 1;

  if (normalizedPath.startsWith('app/') || normalizedPath.startsWith('src/')) score += 1.4;
  if (normalizedPath.includes('/lib/')) score += 0.8;
  if (normalizedPath.includes('/api/')) score += 0.45;
  if (normalizedPath.includes('/components/')) score += 0.45;
  if (normalizedPath.includes('/route.')) score += 0.2;

  if (DEPRIORITIZED_EXTS.has(ext)) score -= 0.9;
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') score += 0.75;

  return Math.max(score, 0.15);
}

function getEligibleVirtualFiles(files: any[]): any[] {
  return files
    .filter(shouldCreateVirtualCards)
    .map((file) => {
      const segments = detectVirtualSegments(file.content, file.path)
        .filter((seg) => seg.type === 'repeating' || seg.occurrences >= 12)
        .slice(0, 3);
      const baseScore = segments.reduce((sum, seg) => sum + compressionScore(seg), 0);
      const score = Math.round(baseScore * getFilePriorityScore(file));
      return { file, segments, score };
    })
    .filter((entry) => entry.segments.length > 0 && entry.score > 900)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VIRTUAL_FILES);
}

// ─── Virtual Card Creation ───────────────────────────────

export function createVirtualCard(
  ctx: CanvasContext,
  segment: VirtualSegment,
  originalFilePath: string,
  x: number,
  y: number,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'file-card virtual-card';
  card.dataset.virtual = 'true';
  card.dataset.originalPath = originalFilePath;
  card.dataset.segmentId = segment.id;
  card.dataset.path = `${originalFilePath}::${segment.id}`;
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;

  const typeIcon = segment.type === 'prefix' ? '🔖' : segment.type === 'repeating' ? '🔁' : '📋';
  const compressionRatio = Math.round((1 - 1 / Math.max(segment.occurrences, 1)) * 100);
  const title = segment.type === 'prefix' ? 'Shared Prefix' : 'Repeated Block';
  const lines = segment.lineNumbers.slice(0, 4).map((n) => n + 1).join(', ');

  card.innerHTML = `
    <div class="card-header" style="background: linear-gradient(135deg, rgba(124,58,237,0.22), rgba(59,130,246,0.22)); border-bottom: 1px solid var(--border-primary); display:flex; align-items:center; gap:8px; padding:10px 12px;">
      <span style="font-size: 14px;">${typeIcon}</span>
      <span style="flex:1; font-weight:600; font-size:11px; color:var(--text-primary);">${title}</span>
      <span style="font-size:10px; color: var(--accent-primary);">-${compressionRatio}%</span>
    </div>
    <div class="card-body" style="padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); overflow: hidden;">
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; color:var(--text-primary);">
        <span>${segment.occurrences} occurrences</span>
        <span>lines ${lines}${segment.lineNumbers.length > 4 ? ', …' : ''}</span>
      </div>
      <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; max-height: 120px; overflow: hidden;">
        <code style="white-space: pre-wrap; word-break: break-word; color: #94a3b8;">${escapeHtml(segment.content.substring(0, 340))}${segment.content.length > 340 ? '…' : ''}</code>
      </div>
      <div style="margin-top:8px; font-size:10px; opacity:0.8;">↗ transcluded from ${escapeHtml(originalFilePath.split('/').pop() || originalFilePath)}</div>
    </div>
  `;

  (card as HTMLElement).style.cssText += `
    position: absolute;
    width: ${VIRTUAL_CARD_WIDTH}px;
    min-height: ${VIRTUAL_CARD_HEIGHT}px;
    background: color-mix(in srgb, var(--bg-card) 92%, #7c3aed 8%);
    border: 1px solid rgba(124, 58, 237, 0.45);
    border-radius: 10px;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
    cursor: pointer;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
    z-index: 12;
  `;

  card.addEventListener('mouseenter', () => {
    highlightConnections(ctx, segment.id, originalFilePath);
    card.style.transform = 'translateY(-2px)';
  });

  card.addEventListener('mouseleave', () => {
    clearConnectionHighlights(ctx);
    card.style.transform = '';
  });

  card.addEventListener('click', () => {
    const originalCard = ctx.fileCards.get(originalFilePath);
    if (originalCard) {
      originalCard.scrollIntoView({ block: 'center', inline: 'center' });
    }
  });

  return card;
}

// ─── Main Integration ────────────────────────────────────

export async function processFileForVirtualCards(
  ctx: CanvasContext,
  filePath: string,
  content: string,
  segmentOffset = 0,
): Promise<number> {
  const placement = getOriginalPlacement(ctx, filePath);
  if (!placement) return 0;

  const segments = detectVirtualSegments(content, filePath).slice(0, MAX_SEGMENTS_PER_FILE);
  if (segments.length === 0) return 0;

  const canvasContent = document.getElementById('canvasContent');
  if (!canvasContent) return 0;

  let created = 0;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const x = placement.x + placement.w + VIRTUAL_CARD_GAP_X;
    const y = placement.y + (segmentOffset + i) * (VIRTUAL_CARD_HEIGHT + VIRTUAL_CARD_GAP_Y);
    const card = createVirtualCard(ctx, segment, filePath, x, y);
    canvasContent.appendChild(card);
    created++;
  }

  return created;
}

export async function processVirtualFileSet(ctx: CanvasContext, files: any[]): Promise<number> {
  clearVirtualCards(ctx);

  const eligible = getEligibleVirtualFiles(files);
  (window as any).__virtualCandidates = eligible.slice(0, 12).map((entry) => ({
    path: entry.file.path,
    score: entry.score,
    segments: entry.segments.length,
  }));
  if (eligible.length === 0) return 0;

  let created = 0;
  let segmentOffset = 0;
  for (const entry of eligible) {
    created += await processFileForVirtualCards(
      ctx,
      entry.file.path,
      entry.file.content,
      segmentOffset,
    );
    segmentOffset += MAX_SEGMENTS_PER_FILE;
  }

  return created;
}

// ─── Connection Highlighting ─────────────────────────────

function highlightConnections(
  ctx: CanvasContext,
  segmentId: string,
  originalFilePath: string,
): void {
  const virtualCard = document.querySelector(`[data-segment-id="${segmentId}"]`) as HTMLElement | null;
  if (virtualCard) {
    virtualCard.style.boxShadow = '0 0 24px rgba(124,58,237,0.45)';
    virtualCard.style.borderColor = 'var(--accent-primary)';
  }

  const originalCard = Array.from(ctx.fileCards.values()).find(
    (card) => card.dataset.path === originalFilePath,
  );
  if (originalCard) {
    (originalCard as HTMLElement).style.boxShadow = '0 0 24px rgba(124,58,237,0.45)';
    (originalCard as HTMLElement).style.borderColor = 'var(--accent-primary)';
  }

  if (virtualCard && originalCard) {
    drawConnectionLine(virtualCard, originalCard as HTMLElement);
  }
}

function clearConnectionHighlights(ctx: CanvasContext): void {
  document.querySelectorAll('.virtual-card').forEach((card) => {
    (card as HTMLElement).style.boxShadow = '';
    (card as HTMLElement).style.borderColor = '';
  });

  ctx.fileCards.forEach((card) => {
    card.style.boxShadow = '';
    card.style.borderColor = '';
  });

  const overlay = (ctx.svgOverlay || document.getElementById('connectionsOverlay')) as SVGSVGElement | null;
  if (overlay) {
    overlay.querySelectorAll('.virtual-connection').forEach((line) => line.remove());
  }
}

function drawConnectionLine(from: HTMLElement, to: HTMLElement): void {
  const overlay = document.getElementById('connectionsOverlay') as SVGSVGElement | null;
  if (!overlay) return;

  overlay.querySelectorAll('.virtual-connection').forEach((line) => line.remove());

  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const viewport = overlay.getBoundingClientRect();

  const x1 = fromRect.left + fromRect.width / 2 - viewport.left;
  const y1 = fromRect.top + fromRect.height / 2 - viewport.top;
  const x2 = toRect.left + toRect.width / 2 - viewport.left;
  const y2 = toRect.top + toRect.height / 2 - viewport.top;

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('class', 'virtual-connection');
  line.setAttribute('stroke', 'var(--accent)');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-dasharray', '4 4');
  line.setAttribute('opacity', '0.55');
  overlay.appendChild(line);
}
