import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { IsWithinThailandBounds } from '../../common/validators/is-within-thailand-bounds.validator';

const MAX_ADDRESS_LENGTH = 200;

@ValidatorConstraint({ name: 'isExclusiveCoordsOrAddress', async: false })
class IsExclusiveCoordsOrAddress implements ValidatorConstraintInterface {
  // The value passed in is irrelevant — this constraint is attached to a
  // property that is deliberately never marked `@IsOptional`, so it always
  // runs (unlike a constraint on `address` or `lat`/`lng`, which
  // `@IsOptional` would skip entirely when that particular field is
  // undefined) and inspects the whole object instead.
  validate(_: unknown, args: ValidationArguments): boolean {
    const { address, lat, lng } = args.object as OriginDto;
    const hasAddress = typeof address === 'string' && address.length > 0;
    const hasCoords = lat !== undefined && lng !== undefined;
    // Exactly one of "address" or "{ lat, lng }" — never both, never neither.
    return hasAddress !== hasCoords;
  }

  defaultMessage(): string {
    return 'origin must be either { lat, lng } or { address }, not both or neither';
  }
}

/**
 * `origin` accepts either coordinates or a free-text address (geocoded
 * server-side) — see SKILL.md's `POST /api/v1/route` contract. `address`,
 * `lat`, and `lng` are each optional at the property level; the unused
 * `shape` marker property carries `IsExclusiveCoordsOrAddress`, which
 * enforces that exactly one branch (address, or lat+lng) is populated.
 */
export class OriginDto {
  @IsOptional()
  @IsString()
  @Length(1, MAX_ADDRESS_LENGTH)
  address?: string;

  // `@IsOptional` here does double duty: it lets the address branch omit
  // `lat` entirely, and it means `IsWithinThailandBounds` (which reads both
  // `lat`/`lng` off this object) is skipped whenever the client sent
  // `{ address }` instead of coordinates — the Thailand-only bbox check only
  // ever applies to directly-supplied coordinates, never to the
  // geocode-resolved address branch (see SKILL.md's "Thailand-only scope").
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  @IsWithinThailandBounds()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  /**
   * Not a real input field — always `undefined`. Exists purely so
   * `IsExclusiveCoordsOrAddress` (which reads sibling properties off
   * `args.object`) always runs, since a constraint placed on `address` or
   * `lat`/`lng` directly would be skipped by that field's own `@IsOptional`
   * whenever the client omits it.
   */
  @Validate(IsExclusiveCoordsOrAddress)
  readonly shape?: undefined;
}
