import { Type } from 'class-transformer';
import {
  IsInt,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Web Mercator tiles only go usefully this deep; also caps how large a `2^z`
// bounds check below has to compute. Bounding `z` is the SSRF/abuse control
// called out in the security checklist for this endpoint — without it, `x`
// and `y` bounds are unbounded and a client could probe arbitrary upstream
// paths.
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 22;

@ValidatorConstraint({ name: 'isWithinTileBounds', async: false })
class IsWithinTileBounds implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const { z, x, y } = args.object as TileParamsDto;
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
      // Let @IsInt on the individual fields report this; don't also fail
      // here with a confusing bounds message.
      return true;
    }
    const maxIndex = 2 ** z;
    return x >= 0 && x < maxIndex && y >= 0 && y < maxIndex;
  }

  defaultMessage(): string {
    return 'x and y must satisfy 0 <= x, y < 2^z for the given zoom level z';
  }
}

export class TileParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(MIN_ZOOM)
  @Max(MAX_ZOOM)
  z!: number;

  @Type(() => Number)
  @IsInt()
  @Validate(IsWithinTileBounds)
  x!: number;

  @Type(() => Number)
  @IsInt()
  y!: number;
}
