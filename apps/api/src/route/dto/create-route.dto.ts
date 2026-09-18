import { Type } from 'class-transformer';
import { IsDefined, IsOptional, ValidateNested } from 'class-validator';
import { LatLngDto } from './lat-lng.dto';
import { OriginDto } from './origin.dto';

export class CreateRouteDto {
  // `@IsDefined` matters here: without it, `@ValidateNested` alone produces
  // no error when `origin` is omitted entirely (there's nothing to descend
  // into), silently letting a body with no origin at all through.
  @IsDefined()
  @ValidateNested()
  @Type(() => OriginDto)
  origin!: OriginDto;

  // Optional — when omitted, RouteService falls back to the office
  // coordinates from env (COMPANY_LAT/COMPANY_LNG). Unlike `origin`, the
  // contract only accepts coordinates here, never a free-text address — the
  // company address is never sent from the client.
  @IsOptional()
  @ValidateNested()
  @Type(() => LatLngDto)
  destination?: LatLngDto;
}
