import { Window } from 'happy-dom';
import {
  estimatePreviewCharsPerLine,
  estimatePreviewLineCapacity,
  getLowZoomPreviewText,
  renderLowZoomPreviewCanvas,
  wrapPreviewText,
} from '../app/lib/low-zoom-preview';

const window = new Window();
const document = window.document;
(globalThis as any).document = document;
(globalThis as any).window = window;
(globalThis as any).devicePixelRatio = 1;

function makeFiles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    path: `src/module-${Math.floor(i / 10)}/file-${i}.ts`,
    ext: 'ts',
    content: Array.from({ length: 120 }, (__, line) => {
      const n = line + 1;
      return `export const value_${i}_${n} = someFunctionCall(${n}, '${'x'.repeat((line % 8) * 6 + 12)}');`;
    }).join('\n'),
  }));
}

function bench(label: string, fn: () => void, iterations = 5) {
  fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const avg = (performance.now() - start) / iterations;
  console.log(`${label.padEnd(36)} ${avg.toFixed(3)}ms`);
  return avg;
}

function createMockCanvas(width: number, height: number) {
  const ops = { fillText: 0, measureText: 0, fillRect: 0 };
  const ctx = {
    fillStyle: '',
    font: '',
    textBaseline: 'top',
    setTransform() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    fillRect() {
      ops.fillRect++;
    },
    createLinearGradient() {
      return {
        addColorStop() {},
      };
    },
    measureText(text: string) {
      ops.measureText++;
      const fontSize = Number(/(\d+(?:\.\d+)?)px/.exec((ctx as any).font)?.[1] || 12);
      return { width: text.length * fontSize * 0.6 };
    },
    fillText() {
      ops.fillText++;
    },
  } as any;

  return {
    width,
    height,
    style: {} as Record<string, any>,
    getContext(type: string) {
      return type === '2d' ? ctx : null;
    },
    ops,
  } as HTMLCanvasElement & { ops: typeof ops };
}

function createDomLowZoomCard(file: any, zoom: number, scrollTop: number) {
  const card = document.createElement('div');
  const title = document.createElement('div');
  const subtitle = document.createElement('div');
  const preview = document.createElement('div');

  const width = 580;
  const height = 700;
  const chars = estimatePreviewCharsPerLine(width, zoom);
  const lines = estimatePreviewLineCapacity(height, zoom);
  const previewText = getLowZoomPreviewText(file, scrollTop) || 'Preview unavailable';
  const wrapped = wrapPreviewText(previewText, chars, lines);

  title.textContent = file.path.split('/').pop() || file.path;
  subtitle.textContent = file.path.split('/').slice(0, -1).join('/') || 'root';
  preview.textContent = wrapped.join('\n');

  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(preview);
  return card;
}

function printSummary(title: string, rows: Array<[string, number]>) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  for (const [label, value] of rows) {
    console.log(`${label.padEnd(36)} ${value.toFixed(3)}ms`);
  }
}

const files = makeFiles(600);
const zoom = 0.14;
const scrollTop = 240;
const width = 580;
const height = 700;

const results: Array<[string, number]> = [];

results.push([
  'layout only × 600 cards',
  bench('layout only × 600 cards', () => {
    for (const file of files) {
      const text = getLowZoomPreviewText(file, scrollTop);
      const chars = estimatePreviewCharsPerLine(width, zoom);
      const lines = estimatePreviewLineCapacity(height, zoom);
      wrapPreviewText(text, chars, lines);
    }
  }),
]);

results.push([
  'old DOM preview create × 600',
  bench('old DOM preview create × 600', () => {
    const root = document.createElement('div');
    for (const file of files) {
      root.appendChild(createDomLowZoomCard(file, zoom, scrollTop));
    }
  }),
]);

const canvases = files.map(() => createMockCanvas(width, height));
results.push([
  'canvas preview draw × 600',
  bench('canvas preview draw × 600', () => {
    files.forEach((file, i) => {
      renderLowZoomPreviewCanvas(canvases[i], {
        path: file.path,
        file,
        width,
        height,
        zoom,
        scrollTop,
        accentColor: '#3178c6',
        isChanged: false,
      });
    });
  }),
]);

const totalTextOps = canvases.reduce((sum, canvas) => sum + canvas.ops.fillText, 0);
const totalMeasureOps = canvases.reduce((sum, canvas) => sum + canvas.ops.measureText, 0);

printSummary('Low-zoom preview benchmark summary', results);
console.log(`\ncanvas fillText ops: ${totalTextOps}`);
console.log(`canvas measureText ops: ${totalMeasureOps}`);
console.log(`visible-card budget example: 600 cards at zoom ${zoom}`);
console.log('\nNote: this benchmark compares GitMaps low-zoom layout/draw paths in a synthetic environment.');
console.log('It is useful for regression tracking, not as a literal browser FPS measurement.');
