import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CompanyModule } from './company/company.module';
import { validateEnv } from './config/env.validation';
import { GeocodeModule } from './geocode/geocode.module';
import { RouteModule } from './route/route.module';
import { TilesModule } from './tiles/tiles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    CacheModule.register({ isGlobal: true }),
    // A generous module-wide default. `POST /route` and `GET /geocode`
    // override this with the much tighter `ORS_THROTTLE` since they are
    // per-user-action calls fronting a quota-limited OpenRouteService plan.
    // `GET /tiles/:z/:x/:y` overrides this with its own, higher
    // `TILE_THROTTLE` (see common/throttle.constants.ts) since a single map
    // viewport legitimately fires dozens of tile requests. `GET /company`
    // stays on this default.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    RouteModule,
    GeocodeModule,
    CompanyModule,
    TilesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
