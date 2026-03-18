import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { processVirtualFileSet } from './virtual-files';

function makeActor() {
  const state = {
    context: {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      repoPath: 'C:/Code/gitmaps',
      selectedCards: [],
      currentCommitHash: '',
      cardSizes: {},
    },
  } as any;

  return {
    getSnapshot() {
      return state;
    },
    send(event: any) {
      if (event?.type === 'SET_ZOOM') state.context.zoom = event.zoom;
      if (event?.type === 'SET_OFFSET') {
        state.context.offsetX = event.x;
        state.context.offsetY = event.y;
      }
    },
  };
}

function setRect(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
  (el as any).getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {},
  });
}

function makeRepeatingContent() {
  const repeated = [
    'export function renderWidget(ctx) {',
    '  const node = document.createElement("div");',
    '  node.className = "widget-row";',
    '  return node;',
    '}',
  ].join('\n');

  const chunks: string[] = [];
  for (let i = 0; i < 40; i++) {
    chunks.push(`INFO widget-${i} start`);
    chunks.push(repeated);
    chunks.push(`INFO widget-${i} end`);
  }
  return chunks.join('\n');
}

describe('transclusion smoke', () => {
  let window: Window;
  let actor: any;
  let ctx: any;
  let sourceCard: HTMLElement;

  beforeEach(() => {
    window = new Window({ url: 'http://localhost:3335/gitmaps' });
    (window as any).SyntaxError = SyntaxError;

    Object.assign(globalThis, {
      window,
      document: window.document,
      navigator: window.navigator,
      localStorage: window.localStorage,
      HTMLElement: window.HTMLElement,
      SVGElement: window.SVGElement,
      Node: window.Node,
      Event: window.Event,
      MouseEvent: window.MouseEvent,
      requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
      cancelAnimationFrame: (id: any) => clearTimeout(id),
    });

    document.body.innerHTML = `
      <div class="canvas-area"></div>
      <div id="canvasViewport"><div id="canvasContent"><svg id="connectionsOverlay"></svg></div></div>
      <input id="zoomSlider" />
      <span id="zoomValue"></span>
      <input id="stickyZoomSlider" />
      <span id="stickyZoomValue"></span>
      <div id="minimap"></div>
      <div id="minimapViewport"></div>
    `;

    const viewport = document.getElementById('canvasViewport') as HTMLElement;
    const canvas = document.getElementById('canvasContent') as HTMLElement;
    const overlay = document.getElementById('connectionsOverlay') as unknown as SVGSVGElement;
    setRect(viewport, 1400, 900);
    setRect(canvas, 4000, 3000);
    setRect(overlay as unknown as HTMLElement, 1400, 900);

    actor = makeActor();
    ctx = {
      actor,
      snap: () => actor.getSnapshot(),
      canvas,
      canvasViewport: viewport,
      svgOverlay: overlay,
      fileCards: new Map(),
      positions: new Map(),
      hiddenFiles: new Set(),
      changedFilePaths: new Set(),
      deferredCards: new Map(),
      allFilesData: null,
      commitFilesData: null,
      isDragging: false,
      spaceHeld: false,
      CORNER_SIZE: 40,
      scrollTimers: {},
      connectionDragState: null,
      loadingOverlay: null,
      textRendererMode: 'dom',
      allFilesActive: true,
      controlMode: 'advanced',
    };

    sourceCard = document.createElement('div');
    sourceCard.className = 'file-card';
    sourceCard.dataset.path = 'app/lib/events.tsx';
    sourceCard.style.left = '900px';
    sourceCard.style.top = '600px';
    setRect(sourceCard, 580, 700);
    canvas.appendChild(sourceCard);
    ctx.fileCards.set('app/lib/events.tsx', sourceCard);
  });

  afterEach(() => {
    window?.close();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  test('creates transclusion cards and clicking one highlights the source card', async () => {
    const files = [
      {
        path: 'app/lib/events.tsx',
        name: 'events.tsx',
        ext: 'tsx',
        type: 'file',
        isBinary: false,
        lines: 240,
        size: 20000,
        content: makeRepeatingContent(),
      },
    ];

    const created = await processVirtualFileSet(ctx, files as any);
    expect(created).toBeGreaterThan(0);
    expect(document.querySelectorAll('.virtual-card').length).toBe(created);

    const candidates = (window as any).__virtualCandidates;
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates[0]?.path).toBe('app/lib/events.tsx');

    const virtualCard = document.querySelector('.virtual-card') as HTMLElement;
    expect(virtualCard).toBeTruthy();
    expect(virtualCard.title).toContain('app/lib/events.tsx');
    expect(virtualCard.textContent || '').toContain('click to jump to source');

    virtualCard.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(sourceCard.style.outline).toContain('var(--accent-primary)');
    expect(sourceCard.style.outlineOffset).toBe('4px');
  });
});
