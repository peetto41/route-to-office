import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';
import { IsWithinThailandBounds } from '../../common/validators/is-within-thailand-bounds.validator';

export class LatLngDto {
  // `IsWithinThailandBounds` reads both `lat` and `lng` off this object (see
  // that validator's doc comment) — attaching it once, here on `lat`, is
  // enough; it does not also need to be repeated on `lng`.
  @Type(() => Number)
  @IsLatitude()
  @IsWithinThailandBounds()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}
