import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import { GeocodingService } from '../openrouteservice/geocoding.service';
import { LatLng, RoutesService } from '../openrouteservice/routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { OriginDto } from './dto/origin.dto';
import { RouteResponseDto } from './dto/route-response.dto';

/**
 * Orchestrates `POST /api/v1/route`: geocode (only if the client sent a
 * free-text address) -> ORS directions -> map into the response contract.
 * Never caches its result — `arrivalTime` is computed from the current time
 * (see references/backend-nestjs.md's "Caching" section), even though
 * `durationSeconds` itself is a static typical-road-speed estimate, not live
 * traffic.
 */
@Injectable()
export class RouteService {
  constructor(
    private readonly geocodingService: GeocodingService,
    private readonly routesService: RoutesService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async createRoute(dto: CreateRouteDto): Promise<RouteResponseDto> {
    const origin = await this.resolveOrigin(dto.origin);
    const destination = dto.destination ?? this.companyLocation();

    const computed = await this.routesService.computeRoute(origin, destination);

    // Computed at request time, not cached — see class-level doc comment.
    const arrivalTime = new Date(
      Date.now() + computed.durationSeconds * 1000,
    ).toISOString();

    return {
      distanceMeters: computed.distanceMeters,
      durationSeconds: computed.durationSeconds,
      arrivalTime,
      route: computed.route,
      bounds: computed.bounds,
      steps: computed.steps,
    };
  }

  private async resolveOrigin(origin: OriginDto): Promise<LatLng> {
    if (origin.address) {
      const geocoded = await this.geocodingService.geocode(origin.address);
      return { lat: geocoded.lat, lng: geocoded.lng };
    }
    // OriginDto's exclusivity validator guarantees lat/lng are present when
    // address isn't.
    return { lat: origin.lat as number, lng: origin.lng as number };
  }

  private companyLocation(): LatLng {
    return {
      lat: this.configService.get('COMPANY_LAT', { infer: true }),
      lng: this.configService.get('COMPANY_LNG', { infer: true }),
    };
  }
}
