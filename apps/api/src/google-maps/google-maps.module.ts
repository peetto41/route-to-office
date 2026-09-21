import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { GoogleMapsHttpClient } from './google-maps-http.client';
import { RoutesService } from './routes.service';

/**
 * The only module that reads `GOOGLE_MAPS_SERVER_API_KEY` (via
 * `GoogleMapsHttpClient`). Nothing outside this module injects
 * `GoogleMapsHttpClient` or the raw key — everything else talks to Google
 * Maps Platform through `RoutesService` or `GeocodingService`.
 */
@Module({
  providers: [GoogleMapsHttpClient, RoutesService, GeocodingService],
  exports: [RoutesService, GeocodingService],
})
export class GoogleMapsModule {}
