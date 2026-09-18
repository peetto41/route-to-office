import { Module } from '@nestjs/common';
import { OpenrouteserviceModule } from '../openrouteservice/openrouteservice.module';
import { RouteController } from './route.controller';
import { RouteService } from './route.service';

@Module({
  imports: [OpenrouteserviceModule],
  controllers: [RouteController],
  providers: [RouteService],
})
export class RouteModule {}
