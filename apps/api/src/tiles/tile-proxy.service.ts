import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { OsmTileClient } from './osm-tile.client';

const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

// Map tiles for a given coordinate don't change request-to-request
// (references/backend-nestjs.md's "Caching" section). An hour balances
// staleness against not re-fetching a tile for every pan/zoom.
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface TileResponse {
  buffer: Buffer;
  contentType: string;
  attribution: string;
}

interface CachedTile {
  base64: string;
  contentType: string;
  attribution: string;
}

/**
 * Fronts `OsmTileClient` with caching. No provider switch — OpenRouteService
 * has no map-tiles product, so `GET /api/v1/tiles/:z/:x/:y` always proxies
 * OpenStreetMap.
 */
@Injectable()
export class TileProxyService {
  constructor(
    private readonly osmTileClient: OsmTileClient,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getTile(z: number, x: number, y: number): Promise<TileResponse> {
    const key = `tile:${z}:${x}:${y}`;

    const cached = await this.cache.get<CachedTile>(key);
    if (cached) {
      return {
        buffer: Buffer.from(cached.base64, 'base64'),
        contentType: cached.contentType,
        attribution: cached.attribution,
      };
    }

    const tile = await this.osmTileClient.getTile(z, x, y);
    const result: TileResponse = { ...tile, attribution: OSM_ATTRIBUTION };
    await this.cache.set(
      key,
      {
        base64: result.buffer.toString('base64'),
        contentType: result.contentType,
        attribution: result.attribution,
      },
      CACHE_TTL_MS,
    );
    return result;
  }
}
