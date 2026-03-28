import { describe, expect, test } from 'bun:test';
import path from 'path';
import {
  assertRouteExpectation,
  discoverContractRoutes,
  gitmapsCatchAllRoutingContract,
} from './router-contract';

describe('Melina catch-all routing contract fixture', () => {
  const fixtureAppDir = path.resolve(import.meta.dir, 'test-fixtures/router-contract');
  const routes = discoverContractRoutes(fixtureAppDir);

  for (const expectation of gitmapsCatchAllRoutingContract) {
    test(`${expectation.pathname} resolves to ${expectation.pattern}`, () => {
      const result = assertRouteExpectation(routes, expectation);
      expect(result.route.pattern).toBe(expectation.pattern);
      if (expectation.params) {
        expect(result.params).toEqual(expectation.params);
      }
    });
  }
});
