import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  hideLoadingProgress,
  showLoadingProgress,
  updateLoadingFileCount,
  updateLoadingMessage,
  updateLoadingProgress,
} from '../../../app/lib/loading';
import { setupDomTest } from '../../../app/lib/test-dom';

describe('repo loading overlay smoke', () => {
  let cleanup: (() => void) | undefined;
  let ctx: any;

  beforeEach(() => {
    const handle = setupDomTest({ url: 'http://localhost:3335/' });
    cleanup = handle.cleanup;
    ctx = { loadingOverlay: null };
  });

  afterEach(() => {
    cleanup?.();
  });

  test('renders file-count progress for a streamed repo load', () => {
    showLoadingProgress(ctx, 'Loading repository...', 0);
    updateLoadingProgress(ctx, 'C:/Code/gitmaps', 10);
    updateLoadingMessage(ctx, 'Loading files — 120 total');
    updateLoadingFileCount(ctx, 45, 120, '45 loaded • 75 remaining');

    const overlay = document.querySelector('.loading-overlay') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.classList.contains('active')).toBe(true);
    expect(overlay.textContent).toContain('Loading files — 120 total');
    expect(overlay.textContent).toContain('45 loaded • 75 remaining');
    expect(overlay.textContent).toContain('120 total • 45 loaded • 75 remaining');
    expect(overlay.textContent).toContain('Total120');
    expect(overlay.textContent).toContain('Loaded45');
    expect(overlay.textContent).toContain('Remaining75');
    expect(overlay.textContent).toContain('38% • 75 remaining');

    const fill = overlay.querySelector('.loading-progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('38%');
  });

  test('keeps indexed file counts visible into the commit-diff phase', () => {
    showLoadingProgress(ctx, 'Loading repository...', 0);
    updateLoadingFileCount(ctx, 120, 120, 'Rendering 120 cards • 0 remaining');
    updateLoadingMessage(ctx, 'Loading commit diff — 120 files indexed');
    updateLoadingFileCount(ctx, 120, 120, 'Comparing selected commit against 120 indexed files');

    const overlay = document.querySelector('.loading-overlay') as HTMLElement;
    expect(overlay.textContent).toContain('Loading commit diff — 120 files indexed');
    expect(overlay.textContent).toContain('Comparing selected commit against 120 indexed files');
    expect(overlay.textContent).toContain('120 total • 120 loaded • 0 remaining');
    expect(overlay.textContent).toContain('100% • 0 remaining');
  });

  test('hides the overlay cleanly after loading completes', () => {
    document.body.classList.add('repo-loading');
    showLoadingProgress(ctx, 'Loading repository...', 0);

    hideLoadingProgress(ctx);

    const overlay = document.querySelector('.loading-overlay') as HTMLElement;
    expect(overlay.classList.contains('active')).toBe(false);
    expect(document.body.classList.contains('repo-loading')).toBe(false);
  });
});
