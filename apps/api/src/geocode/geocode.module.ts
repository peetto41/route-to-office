import { Module } from '@nestjs/common';
import { OpenrouteserviceModule } from '../openrouteservice/openrouteservice.module';
import { GeocodeController } from './geocode.controller';
import { GeocodeService } from './geocode.service';

@Module({
  imports: [OpenrouteserviceModule],
  controllers: [GeocodeController],
  providers: [GeocodeService],
})
export class GeocodeModule {}
