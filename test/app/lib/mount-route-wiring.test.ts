import { describe, expect, mock, test } from 'bun:test';
import { bindMountPopstate, wireMountRoutes } from '../../../app/lib/mount-route-wiring';

describe('mount route wiring helper', () => {
  test('wires initial hydration through shared route helpers', async () => {
    const calls: string[] = [];
    const ctx = { snap: () => ({ context: { repoPath: 'C:/Code/gitmaps' } }) } as any;
    const hydrateRoutes = mock(async (_ctx: any, options: any) => {
      calls.push('hydrateRoutes');
      await options.resolveRepoPath('7flash/gitmaps');
      await options.bootstrapRepoUi('C:/Code/gitmaps');
    });
    const resolveRepoPath = mock(async () => {
      calls.push('resolveRepoPath');
      return 'C:/Code/gitmaps';
    });
    const bootstrapRepoUi = mock(async () => {
      calls.push('bootstrapRepoUi');
    });
    const bindPopstate = mock(() => {
      calls.push('bindPopstate');
    });

    await wireMountRoutes(ctx, {
      isDisposed: () => false,
      showLandingPlaceholder: mock(() => undefined),
      updateFavoriteStar: mock(() => undefined),
      applySharedLayout: mock(async () => undefined),
      hydrateRoutes: hydrateRoutes as any,
      resolveRepoPath: resolveRepoPath as any,
      bootstrapRepoUi: bootstrapRepoUi as any,
      bindPopstate: bindPopstate as any,
    });

    expect(calls).toEqual([
      'hydrateRoutes',
      'resolveRepoPath',
      'bootstrapRepoUi',
      'bindPopstate',
    ]);
  });

  test('falls back to route error handler when initial resolution throws', async () => {
    const handleRouteError = mock(async () => null);
    const hydrateRoutes = mock(async (_ctx: any, options: any) => {
      await options.resolveRepoPath('7flash/gitmaps');
    });

    await wireMountRoutes({} as any, {
      isDisposed: () => false,
      showLandingPlaceholder: mock(() => undefined),
      updateFavoriteStar: mock(() => undefined),
      applySharedLayout: mock(async () => undefined),
      hydrateRoutes: hydrateRoutes as any,
      resolveRepoPath: mock(async () => {
        throw new Error('boom');
      }) as any,
      handleRouteError: handleRouteError as any,
      bindPopstate: mock(() => undefined) as any,
    });

    expect(handleRouteError).toHaveBeenCalledTimes(1);
  });

  test('binds popstate to the shared route-entry helper with current repo state', () => {
    let popHandler: (() => void) | undefined;
    const addListener = mock((_type: string, handler: () => void) => {
      popHandler = handler;
    });
    const showLandingPlaceholder = mock(() => undefined);
    const updateFavoriteStar = mock(() => undefined);
    const ctx = {
      snap: () => ({ context: { repoPath: 'C:/Code/gitmaps' } }),
      onRepoReady: mock(() => undefined),
    } as any;

    bindMountPopstate(ctx, {
      isDisposed: () => false,
      showLandingPlaceholder,
      updateFavoriteStar,
      addListener,
    });

    expect(addListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    expect(popHandler).toBeDefined();
  });
});
