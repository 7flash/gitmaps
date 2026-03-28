export {
  assertRouteExpectation,
  catchAllRoutingContract,
  discoverContractRoutes,
} from '../../../melina.js/src/server/router-contract';

export type { RouteExpectation } from '../../../melina.js/src/server/router-contract';

export const gitmapsCatchAllRoutingContract: RouteExpectation[] = [
  { pathname: '/', pattern: '/' },
  { pathname: '/galaxy-canvas', pattern: '/galaxy-canvas' },
  { pathname: '/api/version', pattern: '/api/version' },
  { pathname: '/starwar', pattern: '/*slug', params: { slug: 'starwar' } },
  {
    pathname: '/team/platform/tools/gitmaps',
    pattern: '/*slug',
    params: { slug: 'team/platform/tools/gitmaps' },
  },
];
