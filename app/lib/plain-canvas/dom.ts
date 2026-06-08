import type { CanvasRefs } from './types';
import { getElement } from './utils';

export function bindCanvasDom(): CanvasRefs {
  const viewport = getElement<HTMLElement>('canvasViewport');
  const canvas = getElement<HTMLElement>('canvasContent');
  if (!viewport || !canvas) throw new Error('Missing #canvasViewport or #canvasContent.');

  viewport.style.display = 'block';
  viewport.style.visibility = 'visible';
  viewport.style.opacity = '1';
  canvas.style.display = 'block';
  canvas.style.visibility = 'visible';
  canvas.style.opacity = '1';

  // The canvas contains file cards only; the obsolete placeholder is never a state.
  canvas.replaceChildren();

  for (const selector of ['#landingPage', '#landing-page', '#landingPlaceholder', '.landing-page', '.landing-placeholder', '.canvas-placeholder']) {
    const placeholder = document.querySelector<HTMLElement>(selector);
    if (placeholder && placeholder !== canvas && !canvas.contains(placeholder)) placeholder.style.display = 'none';
  }

  return {
    viewport,
    canvas,
    repoSelect: getElement<HTMLSelectElement>('repoSelect'),
    repoPath: getElement<HTMLInputElement>('repoPath'),
    folderPicker: getElement<HTMLInputElement>('folderPickerInput'),
    status: getElement<HTMLElement>('cloneStatus'),
    timeline: getElement<HTMLElement>('timelineContainer'),
    commitCount: getElement<HTMLElement>('commitCount'),
    currentCommit: getElement<HTMLElement>('currentCommitInfo'),
    fileCount: getElement<HTMLElement>('fileCount'),
  };
}