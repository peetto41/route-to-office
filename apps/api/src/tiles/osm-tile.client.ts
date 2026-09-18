import { Injectable } from '@nestjs/common';
import { UpstreamMapsException } from '../common/exceptions/upstream-maps.exception';

const OSM_USER_AGENT =
  'route-to-office/1.0 (server-side tile proxy; see apps/api)';

// See openrouteservice/ors-http.client.ts's doc comment on the same
// constant — a prior security review flagged missing timeouts on outbound
// calls; apply the same fix here.
const REQUEST_TIMEOUT_MS = 8_000;

export interface OsmTileResult {
  buffer: Buffer;
  contentType: string;
}

/**
 * Proxies OpenStreetMap tiles for `GET /api/v1/tiles/:z/:x/:y` — no API key
 * involved, no provider switch: OpenRouteService has no map-tiles product,
 * so OSM is the only tile source (see references/backend-nestjs.md's "Tile
 * proxy" section). Sets a proper `User-Agent` per OSM's usage policy.
 */
@Injectable()
export class OsmTileClient {
  async getTile(z: number, x: number, y: number): Promise<OsmTileResult> {
    let response: Response;
    try {
      response = await fetch(
        `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        {
          headers: { 'User-Agent': OSM_USER_AGENT },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      throw new UpstreamMapsException(
        'The tile service is temporarily unavailable.',
      );
    }
    if (!response.ok) {
      throw new UpstreamMapsException(
        'The tile service is temporarily unavailable.',
      );
    }
    const contentType = response.headers.get('content-type') ?? 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType };
  }
}
