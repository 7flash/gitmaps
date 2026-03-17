import { describe, expect, test } from 'bun:test';
import { extractCanonicalForgeSlugInfo } from './route';

describe('extractCanonicalForgeSlugInfo', () => {
    test('parses GitHub HTTPS remote', () => {
        expect(
            extractCanonicalForgeSlugInfo('https://github.com/7flash/gitmaps.git')
        ).toEqual({
            slug: '7flash/gitmaps',
            source: 'github.com · https://github.com/7flash/gitmaps',
        });
    });

    test('parses GitHub SSH remote', () => {
        expect(
            extractCanonicalForgeSlugInfo('git@github.com:7flash/gitmaps.git')
        ).toEqual({
            slug: '7flash/gitmaps',
            source: 'github.com · git@github.com:7flash/gitmaps',
        });
    });

    test('preserves deep GitLab namespace', () => {
        expect(
            extractCanonicalForgeSlugInfo('git@gitlab.com:team/platform/tools/gitmaps.git')
        ).toEqual({
            slug: 'team/platform/tools/gitmaps',
            source: 'gitlab.com · git@gitlab.com:team/platform/tools/gitmaps',
        });
    });

    test('filters forge helper path segments like scm', () => {
        expect(
            extractCanonicalForgeSlugInfo('https://git.example.com/scm/team/gitmaps.git')
        ).toEqual({
            slug: 'team/gitmaps',
            source: 'git.example.com · https://git.example.com/scm/team/gitmaps',
        });
    });

    test('returns null slug for too-deep namespaces', () => {
        expect(
            extractCanonicalForgeSlugInfo('https://git.example.com/a/b/c/d/e/f.git')
        ).toEqual({
            slug: null,
            source: 'https://git.example.com/a/b/c/d/e/f',
        });
    });

    test('returns null slug for invalid segments', () => {
        expect(
            extractCanonicalForgeSlugInfo('https://git.example.com/team/bad:name.git')
        ).toEqual({
            slug: null,
            source: 'https://git.example.com/team/bad:name',
        });
    });

    test('handles missing remote gracefully', () => {
        expect(extractCanonicalForgeSlugInfo(null)).toEqual({ slug: null, source: '' });
    });
});
