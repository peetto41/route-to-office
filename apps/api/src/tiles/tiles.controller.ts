import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { TILE_THROTTLE } from '../common/throttle.constants';
import { TileParamsDto } from './dto/tile-params.dto';
import { TileProxyService } from './tile-proxy.service';

/**
 * `GET /api/v1/tiles/:z/:x/:y` — proxies OpenStreetMap tiles (see
 * `tile-proxy.service.ts`); there is no provider switch, OpenRouteService has
 * no map-tiles product. Unlike `POST /route` and `GET /geocode`, this is not
 * a per-user-action endpoint — a single map viewport fires dozens of these,
 * and panning/zooming fires many more — so it carries its own, much higher
 * `TILE_THROTTLE` rather than the tight `ORS_THROTTLE`. It still caps abuse
 * (OSM's usage policy expects reasonable, not unlimited, request volume),
 * just sized for map-panning traffic.
 */
@Throttle({ default: TILE_THROTTLE })
@Controller('tiles')
export class TilesController {
  constructor(private readonly tileProxyService: TileProxyService) {}

  @Get(':z/:x/:y')
  async getTile(
    @Param() params: TileParamsDto,
    @Res() res: Response,
  ): Promise<void> {
    const tile = await this.tileProxyService.getTile(
      params.z,
      params.x,
      params.y,
    );
    res
      .status(200)
      .set({
        'Content-Type': tile.contentType,
        'X-Tile-Attribution': tile.attribution,
      })
      .send(tile.buffer);
  }
}
