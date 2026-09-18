import type { Cache } from 'cache-manager';
import { OsmTileClient } from './osm-tile.client';
import { TileProxyService } from './tile-proxy.service';

/**
 * Direct unit test for the tile cache-by-`z:x:y` behavior described in
 * references/backend-nestjs.md's "Caching" section. Only previously covered
 * indirectly for `GET /geocode` in `test/cache.e2e-spec.ts` — nothing
 * exercised `GET /tiles/:z/:x/:y`'s caching at all before this file, so this
 * closes a real gap rather than duplicating existing coverage.
 *
 * Uses a plain in-memory Map standing in for `Cache`, matching the
 * `get`/`set` surface `TileProxyService` actually calls — no TTL expiry logic
 * needs to be exercised, just that a hit short-circuits the OSM client call
 * and a miss (including for a *different* z/x/y) does not.
 */
function createFakeCache(): Cache {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key))),
    set: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  } as unknown as Cache;
}

describe('TileProxyService', () => {
  function buildService(getTile: jest.Mock) {
    const osmTileClient = { getTile } as unknown as OsmTileClient;
    const cache = createFakeCache();
    return { service: new TileProxyService(osmTileClient, cache), cache };
  }

  it('calls the underlying OSM client once for two requests of the same z/x/y', async () => {
    const getTile = jest.fn().mockResolvedValue({
      buffer: Buffer.from('tile-bytes'),
      contentType: 'image/png',
    });
    const { service } = buildService(getTile);

    const first = await service.getTile(1, 0, 0);
    const second = await service.getTile(1, 0, 0);

    expect(getTile).toHaveBeenCalledTimes(1);
    expect(second.buffer).toEqual(first.buffer);
    expect(second.contentType).toBe(first.contentType);
    expect(second.attribution).toBe(first.attribution);
  });

  it("caches by the full z:x:y key — a different tile is fetched separately, not served from another tile's cache entry", async () => {
    const getTile = jest.fn().mockResolvedValue({
      buffer: Buffer.from('tile-bytes'),
      contentType: 'image/png',
    });
    const { service } = buildService(getTile);

    await service.getTile(1, 0, 0);
    await service.getTile(1, 0, 1); // different y
    await service.getTile(1, 1, 0); // different x
    await service.getTile(2, 0, 0); // different z

    expect(getTile).toHaveBeenCalledTimes(4);
  });

  it('round-trips the tile bytes through the cache unchanged', async () => {
    const originalBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    const getTile = jest.fn().mockResolvedValue({
      buffer: originalBytes,
      contentType: 'image/png',
    });
    const { service } = buildService(getTile);

    await service.getTile(3, 2, 1);
    const cachedResult = await service.getTile(3, 2, 1);

    expect(cachedResult.buffer).toEqual(originalBytes);
  });

  it('always attaches the OSM attribution, including on a cache hit', async () => {
    const getTile = jest.fn().mockResolvedValue({
      buffer: Buffer.from('tile-bytes'),
      contentType: 'image/png',
    });
    const { service } = buildService(getTile);

    await service.getTile(5, 5, 5);
    const cachedResult = await service.getTile(5, 5, 5);

    expect(cachedResult.attribution).toBe('© OpenStreetMap contributors');
  });
});
