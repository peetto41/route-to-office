import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

export interface HealthResponseDto {
  status: 'ok';
}

/**
 * `GET /api/v1/health` — liveness check for uptime monitors/load balancers.
 * No auth, no upstream call (does not check Google Maps Platform reachability
 * — a transient Google Maps blip shouldn't report this app as unhealthy),
 * and no dependency on `GoogleMapsModule` or any other module that touches
 * `GOOGLE_MAPS_SERVER_API_KEY` or does network I/O. `@SkipThrottle()` opts
 * this controller out of the global throttler entirely (not just a generous
 * limit) — a monitor polling this every few seconds must never see a
 * false-negative 429 (see `references/backend-nestjs.md`'s "Rate limiting"
 * section).
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponseDto {
    return { status: 'ok' };
  }
}
