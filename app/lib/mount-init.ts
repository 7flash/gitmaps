import type { CanvasContext } from './context';
import { loadSavedPositions } from './positions';
import { loadHiddenFiles, updateHiddenUI } from './hidden-files';
import { setupCanvasInteraction, setupEventListeners } from './events';
import { loadConnections } from './connections';
import { setupPillInteraction } from './viewport-culling';
import { setupAuth } from './user';
import { setupPerfOverlay } from './perf-overlay';
import { initGalaxyDrawState, initCardManager } from './xydraw-bridge';
import { initBranchCompare } from './branch-compare';
import { initCommandPalette } from './command-palette';
import { initShortcutsPanel } from './shortcuts-panel';
import { initStatusBar } from './status-bar';
import { initLayoutSnapshots } from './layout-snapshots';
import { renderSyncControls } from './sync-controls';
import { renderVersionBadge } from './version';
import { renderRoleBadge } from './role';
import { renderRecentCommitsUI } from './recent-commits';
import { installMainCanvasUxFixes } from './main-canvas-ux-fixes';

export function ensureSvgOverlay(ctx: CanvasContext) {
  ctx.svgOverlay = document.getElementById('connectionsOverlay') as unknown as SVGSVGElement;
  if (!ctx.svgOverlay && ctx.canvas) {
    ctx.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    ctx.svgOverlay.id = 'connectionsOverlay';
    ctx.svgOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible;';
    ctx.canvas.appendChild(ctx.svgOverlay);
  }
}

export async function initializeMountUi(
  ctx: CanvasContext,
  actor: { start: () => void },
  options: {
    isDisposed: () => boolean;
    initDrawState?: (ctx: CanvasContext) => void;
    initCards?: (ctx: CanvasContext) => void;
    setupCanvasUi?: (ctx: CanvasContext) => void;
    setupEvents?: (ctx: CanvasContext) => void;
    setupPills?: (ctx: CanvasContext) => void;
    setupPerf?: (ctx: CanvasContext) => void;
    initBranches?: (ctx: CanvasContext) => void;
    initCommands?: (ctx: CanvasContext) => void;
    initShortcuts?: () => void;
    initStatus?: (ctx: CanvasContext) => void;
    initSnapshots?: (ctx: CanvasContext) => void;
    loadPositions?: (ctx: CanvasContext) => Promise<void>;
    loadHidden?: (ctx: CanvasContext) => void;
    updateHidden?: (ctx: CanvasContext) => void;
    loadSavedConnections?: (ctx: CanvasContext) => void;
    setupAuthUi?: () => void;
    renderRole?: () => void;
    renderSync?: () => void;
    renderVersion?: () => Promise<void>;
    renderRecents?: () => void;
  },
) {
  const initDrawState = options.initDrawState || initGalaxyDrawState;
  const initCards = options.initCards || initCardManager;
  const setupCanvasUi = options.setupCanvasUi || setupCanvasInteraction;
  const setupEvents = options.setupEvents || setupEventListeners;
  const setupPills = options.setupPills || setupPillInteraction;
  const setupPerf = options.setupPerf || setupPerfOverlay;
  const initBranches = options.initBranches || initBranchCompare;
  const initCommands = options.initCommands || initCommandPalette;
  const initShortcuts = options.initShortcuts || initShortcutsPanel;
  const initStatus = options.initStatus || initStatusBar;
  const initSnapshots = options.initSnapshots || initLayoutSnapshots;
  const loadPositions = options.loadPositions || loadSavedPositions;
  const loadHidden = options.loadHidden || loadHiddenFiles;
  const updateHidden = options.updateHidden || updateHiddenUI;
  const loadSavedConnections = options.loadSavedConnections || loadConnections;
  const setupAuthUi = options.setupAuthUi || setupAuth;
  const renderRole = options.renderRole || renderRoleBadge;
  const renderSync = options.renderSync || renderSyncControls;
  const renderVersion = options.renderVersion || renderVersionBadge;
  const renderRecents = options.renderRecents || renderRecentCommitsUI;

  initDrawState(ctx);
  initCards(ctx);
  actor.start();
  setupCanvasUi(ctx);
  setupEvents(ctx);
  setupPills(ctx);
  setupPerf(ctx);
  initBranches(ctx);
  initCommands(ctx);
  initShortcuts();
  initStatus(ctx);
  initSnapshots(ctx);
  await loadPositions(ctx);
  if (options.isDisposed()) return;
  loadHidden(ctx);
  updateHidden(ctx);
  loadSavedConnections(ctx);
  if (options.isDisposed()) return;
  setupAuthUi();
  renderRole();
  renderSync();
  await renderVersion();
  renderRecents();
  installMainCanvasUxFixes(ctx);
}