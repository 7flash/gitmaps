import { describe, expect, test } from 'bun:test';
import { getLowZoomPreviewText, getLowZoomScale } from './low-zoom-preview';

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
});
