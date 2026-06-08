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
  { pathname: '/~repo/%2FUsers%2Figor%2Fwork%2Fproject', pattern: '/*slug', params: { slug: '~repo/%2FUsers%2Figor%2Fwork%2Fproject' } },
  {
    pathname: '/team/platform/tools/gitmaps',
    pattern: '/*slug',
    params: { slug: 'team/platform/tools/gitmaps' },
  },
];