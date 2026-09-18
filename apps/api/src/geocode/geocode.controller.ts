import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ORS_THROTTLE } from '../common/throttle.constants';
import { GeocodeQueryDto } from './dto/geocode-query.dto';
import { GeocodeResponseDto } from './dto/geocode-response.dto';
import { GeocodeService } from './geocode.service';

/**
 * `GET /api/v1/geocode?address=...` — resolves a free-text address to
 * coordinates independent of computing a full route. Fronts OpenRouteService
 * Geocoding, which has its own plan quota, and is a per-user-action call, so
 * it carries the same tight throttle as `POST /route`. `GET /tiles/:z/:x/:y`
 * is a different shape of traffic and uses its own, much higher
 * `TILE_THROTTLE` instead.
 */
@Throttle({ default: ORS_THROTTLE })
@Controller('geocode')
export class GeocodeController {
  constructor(private readonly geocodeService: GeocodeService) {}

  @Get()
  async geocode(@Query() query: GeocodeQueryDto): Promise<GeocodeResponseDto> {
    return this.geocodeService.geocode(query.address);
  }
}
