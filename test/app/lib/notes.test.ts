import { describe, expect, test } from 'bun:test';
import { createLineNote, findBestLineMatch, getFileLines, normalizeLineText, reconcileNoteAgainstFile, reconcileNotesAgainstFiles } from '../../../app/lib/notes';

describe('line notes helpers', () => {
  test('normalizes line text consistently', () => {
    expect(normalizeLineText('\t hello  ')).toBe('hello');
  });

  test('splits files into lines', () => {
    expect(getFileLines('a\r\nb\n').length).toBe(3);
  });

  test('creates a note with original line metadata', () => {
    const note = createLineNote({
      path: 'src/example.ts',
      lineNumber: 3,
      lineText: 'const value = 1;',
      note: 'important',
    });
    expect(note.lineNumber).toBe(3);
    expect(note.originalLineNumber).toBe(3);
    expect(note.lineText).toBe('const value = 1;');
  });

  test('finds nearest exact text match when duplicate lines exist', () => {
    const lines = [
      'alpha',
      'target()',
      'beta',
      'target()',
      'gamma',
    ];
    expect(findBestLineMatch(lines, 'target()', 4)).toBe(4);
    expect(findBestLineMatch(lines, 'target()', 2)).toBe(2);
  });

  test('reconciles a note to a moved line with same content', () => {
    const note = createLineNote({
      path: 'src/example.ts',
      lineNumber: 2,
      lineText: 'target()',
      note: 'watch this',
    });
    const reconciled = reconcileNoteAgainstFile(note, {
      path: 'src/example.ts',
      content: ['header', 'alpha', 'beta', 'target()', 'footer'].join('\n'),
    });
    expect(reconciled.lineNumber).toBe(4);
  });

  test('reconciles note collections against file sets', () => {
    const notes = [
      createLineNote({ path: 'a.ts', lineNumber: 1, lineText: 'one', note: 'A' }),
      createLineNote({ path: 'b.ts', lineNumber: 1, lineText: 'two', note: 'B' }),
    ];
    const reconciled = reconcileNotesAgainstFiles(notes, [
      { path: 'a.ts', content: ['x', 'one'].join('\n') },
      { path: 'b.ts', content: ['two', 'y'].join('\n') },
    ]);
    expect(reconciled[0].lineNumber).toBe(2);
    expect(reconciled[1].lineNumber).toBe(1);
  });
});
