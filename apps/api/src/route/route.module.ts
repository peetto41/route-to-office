import { Module } from '@nestjs/common';
import { GoogleMapsModule } from '../google-maps/google-maps.module';
import { RouteController } from './route.controller';
import { RouteService } from './route.service';

@Module({
  imports: [GoogleMapsModule],
  controllers: [RouteController],
  providers: [RouteService],
})
export class RouteModule {}
