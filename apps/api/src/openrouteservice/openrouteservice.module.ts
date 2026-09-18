import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { OrsHttpClient } from './ors-http.client';
import { RoutesService } from './routes.service';

/**
 * The only module that reads `ORS_API_KEY` (via `OrsHttpClient`). Nothing
 * outside this module injects `OrsHttpClient` or the raw key — everything
 * else talks to OpenRouteService through `RoutesService` or
 * `GeocodingService`.
 */
@Module({
  providers: [OrsHttpClient, RoutesService, GeocodingService],
  exports: [RoutesService, GeocodingService],
})
export class OpenrouteserviceModule {}
