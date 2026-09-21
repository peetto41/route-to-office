import { Module } from '@nestjs/common';
import { GoogleMapsModule } from '../google-maps/google-maps.module';
import { GeocodeController } from './geocode.controller';
import { GeocodeService } from './geocode.service';

@Module({
  imports: [GoogleMapsModule],
  controllers: [GeocodeController],
  providers: [GeocodeService],
})
export class GeocodeModule {}
