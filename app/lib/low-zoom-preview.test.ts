import { describe, expect, test } from 'bun:test';
import { estimatePreviewCharsPerLine, estimatePreviewLineCapacity, getLowZoomPreviewText, getLowZoomScale, wrapPreviewText } from './low-zoom-preview';

describe('low zoom preview helpers', () => {
  test('anchors preview text to approximate saved scroll position', () => {
    const file = {
      path: 'src/example.ts',
      ext: 'ts',
      content: Array.from({ length: 12 }, (_, i) => `line-${i + 1}`).join('\n'),
    };

    expect(getLowZoomPreviewText(file, 0).startsWith('line-1')).toBe(true);
    expect(getLowZoomPreviewText(file, 40).startsWith('line-3')).toBe(true);
  });

  test('skips binary or unsupported files', () => {
    expect(getLowZoomPreviewText({ path: 'image.png', ext: 'png', content: 'abc' }, 0)).toBe('');
    expect(getLowZoomPreviewText({ path: 'bin.dat', ext: 'dat', isBinary: true, content: 'abc' }, 0)).toBe('');
  });

  test('increases world-space font size as zoom goes down', () => {
    const near = getLowZoomScale(0.25);
    const far = getLowZoomScale(0.1);
    expect(far.titleFont).toBeGreaterThan(near.titleFont);
    expect(far.bodyFont).toBeGreaterThan(near.bodyFont);
  });

  test('wraps preview text into bounded lines with ellipsis', () => {
    const lines = wrapPreviewText('alpha beta gamma delta epsilon zeta eta theta', 10, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1]?.endsWith('…')).toBe(true);
  });

  test('preview capacity estimates stay positive', () => {
    expect(estimatePreviewCharsPerLine(580, 0.25)).toBeGreaterThan(8);
    expect(estimatePreviewLineCapacity(700, 0.25)).toBeGreaterThanOrEqual(2);
  });
});
