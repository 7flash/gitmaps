import { describe, expect, test } from 'bun:test';
import { estimatePreviewCharsPerLine, estimatePreviewLineCapacity, estimatePreviewMaxScroll, estimateTitleCharsPerLine, getLowZoomPreviewText, getLowZoomScale, wrapPreviewText } from './low-zoom-preview';

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

  test('keeps zoomed-out on-screen text smaller than zoomed-in text', () => {
    const far = getLowZoomScale(0.1);
    const near = getLowZoomScale(1);
    expect(far.titleFont * 0.1).toBeLessThan(near.titleFont * 1);
    expect(far.bodyFont * 0.1).toBeLessThan(near.bodyFont * 1);
  });

  test('wraps preview text into bounded lines with ellipsis', () => {
    const lines = wrapPreviewText('alpha beta gamma delta epsilon zeta eta theta', 10, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1]?.endsWith('…')).toBe(true);
  });

  test('preview capacity estimates stay positive', () => {
    expect(estimatePreviewCharsPerLine(580, 0.25)).toBeGreaterThan(8);
    expect(estimateTitleCharsPerLine(580, 0.25)).toBeGreaterThan(8);
    expect(estimatePreviewLineCapacity(700, 0.25)).toBeGreaterThanOrEqual(3);
  });

  test('higher zoom yields substantially more visible preview lines', () => {
    expect(estimatePreviewLineCapacity(700, 1)).toBeGreaterThanOrEqual(20);
    expect(estimatePreviewLineCapacity(700, 0.1)).toBeLessThan(estimatePreviewLineCapacity(700, 1));
  });

  test('preview scroll range grows with longer files', () => {
    const shortFile = { content: Array.from({ length: 8 }, (_, i) => `line-${i}`).join('\n') };
    const longFile = { content: Array.from({ length: 80 }, (_, i) => `line-${i}`).join('\n') };
    expect(estimatePreviewMaxScroll(shortFile, 700, 1)).toBeGreaterThanOrEqual(0);
    expect(estimatePreviewMaxScroll(longFile, 700, 1)).toBeGreaterThan(estimatePreviewMaxScroll(shortFile, 700, 1));
  });

  test('title typography is larger than body typography for readability', () => {
    const scale = getLowZoomScale(0.18);
    expect(scale.titleFont).toBeGreaterThan(scale.bodyFont);
    expect(scale.titleLineHeight).toBeGreaterThan(scale.bodyLineHeight * 0.7);
  });
});
