import { describe, expect, test } from 'bun:test';
import path from 'path';
import {
    assertRouteExpectation,
    discoverContractRoutes,
    gitmapsCatchAllRoutingContract,
} from '../../../app/lib/router-contract';

describe('GitMaps catch-all route integration', () => {
    const appDir = path.resolve(import.meta.dir, '..');
    const routes = discoverContractRoutes(appDir);

    test('discovers the catch-all slug route', () => {
        const catchAll = routes.find(r => r.pattern === '/*slug');
        expect(catchAll).toBeDefined();
    });

    for (const expectation of gitmapsCatchAllRoutingContract) {
        test(`${expectation.pathname} matches ${expectation.pattern} in the real app`, () => {
            const result = assertRouteExpectation(routes, expectation);
            expect(result.route.pattern).toBe(expectation.pattern);
            if (expectation.params) {
                expect(result.params).toEqual(expectation.params);
            }
        });
    }
});
