import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import {
  isWithinThailand,
  THAILAND_BOUNDS,
} from '../thailand-bounds.constants';

/**
 * Reusable Thailand-bbox check for any `{ lat, lng }`-shaped DTO
 * (`LatLngDto`, and the coordinate branch of `OriginDto`) — reads both `lat`
 * and `lng` off the object under validation, the same sibling-field pattern
 * `tiles/dto/tile-params.dto.ts`'s `IsWithinTileBounds` uses, so this only
 * needs to be attached to one field (`lat`) rather than duplicated on both
 * `lat` and `lng`, and never needs the four-comparison bbox check
 * copy-pasted per DTO.
 *
 * Deliberately permissive (returns `true`, i.e. "no bbox violation found")
 * whenever `lat`/`lng` aren't both present finite numbers — that's
 * `@IsLatitude`/`@IsLongitude` territory (or, on `OriginDto`, the exclusive
 * coords/address constraint). This also means: when this decorator is
 * attached to a property that also carries `@IsOptional()` (as on
 * `OriginDto.lat`), class-validator skips this constraint entirely whenever
 * the client sent `{ address }` instead of coordinates — the Thailand-only
 * bbox check applies only to directly-supplied coordinates, never to the
 * geocode-resolved address branch, which is already scoped to Thailand via
 * OpenRouteService's own country filter (see SKILL.md's "Thailand-only
 * scope" section).
 */
@ValidatorConstraint({ name: 'isWithinThailandBounds', async: false })
class IsWithinThailandBoundsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const { lat, lng } = args.object as { lat?: unknown; lng?: unknown };
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      return true;
    }
    return isWithinThailand(lat, lng);
  }

  defaultMessage(): string {
    return (
      "coordinates must fall within Thailand's bounding box " +
      `(lat ${THAILAND_BOUNDS.minLat} to ${THAILAND_BOUNDS.maxLat}, ` +
      `lng ${THAILAND_BOUNDS.minLng} to ${THAILAND_BOUNDS.maxLng})`
    );
  }
}

export function IsWithinThailandBounds(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: IsWithinThailandBoundsConstraint,
    });
  };
}
