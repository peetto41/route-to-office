import { Module } from '@nestjs/common';
import { OsmTileClient } from './osm-tile.client';
import { TileProxyService } from './tile-proxy.service';
import { TilesController } from './tiles.controller';

@Module({
  controllers: [TilesController],
  providers: [TileProxyService, OsmTileClient],
})
export class TilesModule {}
