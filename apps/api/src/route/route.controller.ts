import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ORS_THROTTLE } from '../common/throttle.constants';
import { CreateRouteDto } from './dto/create-route.dto';
import { RouteResponseDto } from './dto/route-response.dto';
import { RouteService } from './route.service';

/**
 * `POST /api/v1/route` — fronts Google Maps Platform's Directions API, which
 * has its own request-rate/daily-volume plan quota, and is a per-user-action
 * call, so it carries the tight throttle shared with `GET /geocode` (see
 * references/backend-nestjs.md's "Rate limiting" section).
 */
@Throttle({ default: ORS_THROTTLE })
@Controller('route')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Post()
  async createRoute(
    @Body() createRouteDto: CreateRouteDto,
  ): Promise<RouteResponseDto> {
    return this.routeService.createRoute(createRouteDto);
  }
}
