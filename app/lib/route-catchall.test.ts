import { describe, expect, test } from 'bun:test';
import path from 'path';
import { discoverRoutes, matchRoute } from '../../../melina.js/src/server/router';

describe('GitMaps catch-all route integration', () => {
    const appDir = path.resolve(import.meta.dir, '..');
    const routes = discoverRoutes(appDir);

    test('discovers the catch-all slug route', () => {
        const catchAll = routes.find(r => r.pattern === '/*slug');
        expect(catchAll).toBeDefined();
    });

    test('single-segment slugs resolve through catch-all', () => {
        const result = matchRoute('/starwar', routes);
        expect(result).not.toBeNull();
        expect(result!.route.pattern).toBe('/*slug');
        expect(result!.params).toEqual({ slug: 'starwar' });
    });

    test('deep forge namespace slugs resolve through catch-all', () => {
        const result = matchRoute('/team/platform/tools/gitmaps', routes);
        expect(result).not.toBeNull();
        expect(result!.route.pattern).toBe('/*slug');
        expect(result!.params).toEqual({ slug: 'team/platform/tools/gitmaps' });
    });

    test('static root route wins over catch-all', () => {
        const result = matchRoute('/', routes);
        expect(result).not.toBeNull();
        expect(result!.route.pattern).toBe('/');
    });

    test('static galaxy-canvas route wins over catch-all', () => {
        const result = matchRoute('/galaxy-canvas', routes);
        expect(result).not.toBeNull();
        expect(result!.route.pattern).toBe('/galaxy-canvas');
    });
});
