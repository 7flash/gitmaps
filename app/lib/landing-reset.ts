import type { CanvasContext } from './context';
import { clearCanvas, updateCanvasTransform, updateZoomUI } from './canvas';
import { hideLoadingProgress } from './loading';
import { clearMultiRepoWorkspace } from './multi-repo';
import {
  updateStatusBarCommit,
  updateStatusBarFiles,
  updateStatusBarRepo,
  updateStatusBarSelected,
} from './status-bar';
import { updateFavoriteStar } from './user';

export function showLandingPlaceholder(
  ctx: CanvasContext,
  options: {
    clearWorkspace?: (ctx: CanvasContext) => void;
    clearCanvasUi?: (ctx: CanvasContext) => void;
    hideLoading?: (ctx: CanvasContext) => void;
    updateCanvas?: (ctx: CanvasContext) => void;
    updateZoom?: (ctx: CanvasContext) => void;
    updateFavorite?: (repoPath: string) => void;
    updateRepoStatus?: (repoPath: string, canonicalSlug?: string, canonicalSource?: string) => void;
    updateCommitStatus?: (hash: string) => void;
    updateFileStatus?: (count: number) => void;
    updateSelectedStatus?: (count: number) => void;
  } = {},
) {
  const clearWorkspace = options.clearWorkspace || clearMultiRepoWorkspace;
  const clearCanvasUi = options.clearCanvasUi || clearCanvas;
  const hideLoading = options.hideLoading || hideLoadingProgress;
  const updateCanvas = options.updateCanvas || updateCanvasTransform;
  const updateZoom = options.updateZoom || updateZoomUI;
  const updateFavorite = options.updateFavorite || updateFavoriteStar;
  const updateRepoStatus = options.updateRepoStatus || updateStatusBarRepo;
  const updateCommitStatus = options.updateCommitStatus || updateStatusBarCommit;
  const updateFileStatus = options.updateFileStatus || updateStatusBarFiles;
  const updateSelectedStatus = options.updateSelectedStatus || updateStatusBarSelected;

  document.body.classList.add('landing-placeholder-visible');
  ctx.actor.send({ type: 'RESET_APP_STATE' });
  clearWorkspace(ctx);
  clearCanvasUi(ctx);
  ctx.fileCards.clear();
  ctx.deferredCards.clear();
  ctx.allFilesData = [];
  ctx.commitFilesData = [];
  ctx.changedFilePaths = new Set();
  ctx.snap().context.repoPath = '';

  const landing = document.getElementById('landingOverlay');
  if (landing) landing.style.display = 'flex';

  const repoSelect = document.getElementById('repoSelect') as HTMLSelectElement | null;
  if (repoSelect) repoSelect.value = '';

  const fileCount = document.getElementById('fileCount');
  if (fileCount) fileCount.textContent = '0';

  const commitCount = document.getElementById('commitCount');
  if (commitCount) commitCount.textContent = '0';

  const commitInfo = document.getElementById('currentCommitInfo');
  if (commitInfo) {
    commitInfo.innerHTML = '<span class="commit-hash-label">No commit selected</span>';
  }

  const timeline = document.getElementById('timelineContainer');
  if (timeline) {
    timeline.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg><p>Load a repository</p></div>';
  }

  const changedFilesList = document.getElementById('changedFilesList');
  if (changedFilesList) changedFilesList.innerHTML = '';

  const changedFilesPanel = document.getElementById('changedFilesPanel');
  if (changedFilesPanel) changedFilesPanel.style.display = 'none';

  const connectionsPanel = document.getElementById('connectionsPanel');
  if (connectionsPanel) connectionsPanel.style.display = 'none';

  const arrangeToolbar = document.getElementById('arrangeToolbar');
  if (arrangeToolbar) arrangeToolbar.style.display = 'none';

  const toggleConnections = document.getElementById('toggleConnections');
  if (toggleConnections) toggleConnections.classList.remove('active');

  const showHidden = document.getElementById('showHidden');
  if (showHidden) showHidden.style.display = 'none';

  const hiddenCount = document.getElementById('hiddenCount');
  if (hiddenCount) hiddenCount.textContent = '0';

  const commitProgressBar = document.getElementById('commitProgressBar');
  if (commitProgressBar) commitProgressBar.style.display = 'none';

  localStorage.setItem('gitcanvas:changedFilesPanelClosed', 'true');

  hideLoading(ctx);
  updateCanvas(ctx);
  updateZoom(ctx);
  updateFavorite('');
  updateRepoStatus('', '', '');
  updateCommitStatus('');
  updateFileStatus(0);
  updateSelectedStatus(0);
}
