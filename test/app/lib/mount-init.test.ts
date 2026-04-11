import { describe, expect, mock, test } from 'bun:test';
import { ensureSvgOverlay, initializeMountUi } from '../../../app/lib/mount-init';
import { setupDomTest } from '../../../app/lib/test-dom';

describe('mount init helper', () => {
  test('ensureSvgOverlay reuses existing overlay or creates one on demand', () => {
    const handle = setupDomTest({ html: '<div id="canvasContent"></div><svg id="connectionsOverlay"></svg>' });
    try {
      const existing = document.getElementById('connectionsOverlay') as unknown as SVGSVGElement;
      const ctx = { canvas: document.getElementById('canvasContent'), svgOverlay: null } as any;
      ensureSvgOverlay(ctx);
      expect(ctx.svgOverlay).toBe(existing);

      existing.remove();
      ctx.svgOverlay = null;
      ensureSvgOverlay(ctx);
      expect(ctx.svgOverlay?.id).toBe('connectionsOverlay');
      expect(document.getElementById('canvasContent')?.querySelector('#connectionsOverlay')).toBeTruthy();
    } finally {
      handle.cleanup();
    }
  });

  test('initializes mount modules in the expected order', async () => {
    const handle = setupDomTest({ html: '<div id="canvasViewport"></div>' });
    try {
      const calls: string[] = [];
      const ctx = { canvasViewport: document.getElementById('canvasViewport') } as any;
      const actor = { start: mock(() => { calls.push('actor.start'); }) };

      await initializeMountUi(ctx, actor, {
        isDisposed: () => false,
        initDrawState: mock(() => { calls.push('initDrawState'); }),
        initCards: mock(() => { calls.push('initCards'); }),
        setupCanvasUi: mock(() => { calls.push('setupCanvasUi'); }),
        setupEvents: mock(() => { calls.push('setupEvents'); }),
        setupPills: mock(() => { calls.push('setupPills'); }),
        setupPerf: mock(() => { calls.push('setupPerf'); }),
        initPreview: mock(() => { calls.push('initPreview'); }),
        initBranches: mock(() => { calls.push('initBranches'); }),
        initCommands: mock(() => { calls.push('initCommands'); }),
        initShortcuts: mock(() => { calls.push('initShortcuts'); }),
        initStatus: mock(() => { calls.push('initStatus'); }),
        initSnapshots: mock(() => { calls.push('initSnapshots'); }),
        loadPositions: mock(async () => { calls.push('loadPositions'); }),
        loadHidden: mock(() => { calls.push('loadHidden'); }),
        updateHidden: mock(() => { calls.push('updateHidden'); }),
        loadSavedConnections: mock(() => { calls.push('loadConnections'); }),
        setupAuthUi: mock(() => { calls.push('setupAuth'); }),
        renderRole: mock(() => { calls.push('renderRole'); }),
        renderSync: mock(() => { calls.push('renderSync'); }),
        renderVersion: mock(async () => { calls.push('renderVersion'); }),
        renderRecents: mock(() => { calls.push('renderRecents'); }),
      });

      expect(calls).toEqual([
        'initDrawState',
        'initCards',
        'actor.start',
        'setupCanvasUi',
        'setupEvents',
        'setupPills',
        'setupPerf',
        'initPreview',
        'initBranches',
        'initCommands',
        'initShortcuts',
        'initStatus',
        'initSnapshots',
        'loadPositions',
        'loadHidden',
        'updateHidden',
        'loadConnections',
        'setupAuth',
        'renderRole',
        'renderSync',
        'renderVersion',
        'renderRecents',
      ]);
    } finally {
      handle.cleanup();
    }
  });

  test('stops after awaited checkpoints when disposed', async () => {
    const handle = setupDomTest({ html: '<div id="canvasViewport"></div>' });
    try {
      let disposed = false;
      const loadHidden = mock(() => undefined);
      const setupAuthUi = mock(() => undefined);

      await initializeMountUi({ canvasViewport: document.getElementById('canvasViewport') } as any, { start: mock(() => undefined) }, {
        isDisposed: () => disposed,
        initDrawState: mock(() => undefined),
        initCards: mock(() => undefined),
        setupCanvasUi: mock(() => undefined),
        setupEvents: mock(() => undefined),
        setupPills: mock(() => undefined),
        setupPerf: mock(() => undefined),
        initPreview: mock(() => undefined),
        initBranches: mock(() => undefined),
        initCommands: mock(() => undefined),
        initShortcuts: mock(() => undefined),
        initStatus: mock(() => undefined),
        initSnapshots: mock(() => undefined),
        loadPositions: mock(async () => { disposed = true; }),
        loadHidden,
        updateHidden: mock(() => undefined),
        loadSavedConnections: mock(() => undefined),
        setupAuthUi,
        renderRole: mock(() => undefined),
        renderSync: mock(() => undefined),
        renderVersion: mock(async () => undefined),
        renderRecents: mock(() => undefined),
      });

      expect(loadHidden).not.toHaveBeenCalled();
      expect(setupAuthUi).not.toHaveBeenCalled();
    } finally {
      handle.cleanup();
    }
  });
});
