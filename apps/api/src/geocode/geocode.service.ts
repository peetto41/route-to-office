import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { GeocodingService } from '../openrouteservice/geocoding.service';
import { GeocodeResponseDto } from './dto/geocode-response.dto';

// An address resolves to the same coordinates regardless of when it's
// asked (references/backend-nestjs.md's "Caching" section) — a day is a
// generous-but-bounded TTL so stale results don't accumulate forever.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(address: string): string {
  return `geocode:${address.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

@Injectable()
export class GeocodeService {
  constructor(
    private readonly geocodingService: GeocodingService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async geocode(address: string): Promise<GeocodeResponseDto> {
    const key = cacheKey(address);
    const cached = await this.cache.get<GeocodeResponseDto>(key);
    if (cached) {
      return cached;
    }

    const result = await this.geocodingService.geocode(address);
    const response: GeocodeResponseDto = {
      lat: result.lat,
      lng: result.lng,
      formattedAddress: result.formattedAddress,
    };
    await this.cache.set(key, response, CACHE_TTL_MS);
    return response;
  }
}
