import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LatLngDto } from '../../route/dto/lat-lng.dto';
import { THAILAND_BOUNDS } from '../thailand-bounds.constants';

async function validateLatLng(lat: number, lng: number) {
  const instance = plainToInstance(LatLngDto, { lat, lng });
  return validate(instance);
}

/**
 * `IsWithinThailandBounds` is exercised here through `LatLngDto` (a plain
 * `{ lat, lng }` shape, as used for `POST /route`'s `destination`) rather
 * than by unit-testing the validator constraint class in isolation, so the
 * assertions double as a check that the decorator is actually wired up on a
 * real DTO field, not just implemented. See SKILL.md's "Thailand-only
 * scope" section for the canonical bbox values.
 */
describe('IsWithinThailandBounds (via LatLngDto)', () => {
  it('accepts coordinates well inside the Thailand bounding box', async () => {
    const errors = await validateLatLng(13.7563, 100.5018); // Bangkok
    expect(errors).toHaveLength(0);
  });

  it('accepts coordinates exactly on the box edges', async () => {
    expect(
      await validateLatLng(THAILAND_BOUNDS.minLat, THAILAND_BOUNDS.minLng),
    ).toHaveLength(0);
    expect(
      await validateLatLng(THAILAND_BOUNDS.maxLat, THAILAND_BOUNDS.maxLng),
    ).toHaveLength(0);
  });

  it('rejects a latitude just north of the box', async () => {
    const errors = await validateLatLng(THAILAND_BOUNDS.maxLat + 0.1, 100.5);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a latitude just south of the box', async () => {
    const errors = await validateLatLng(THAILAND_BOUNDS.minLat - 0.1, 100.5);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a longitude just east of the box', async () => {
    const errors = await validateLatLng(13.75, THAILAND_BOUNDS.maxLng + 0.1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a longitude just west of the box', async () => {
    const errors = await validateLatLng(13.75, THAILAND_BOUNDS.minLng - 0.1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects coordinates on the wrong continent entirely (e.g. Taiwan)', async () => {
    const errors = await validateLatLng(25.03, 121.5);
    expect(errors.length).toBeGreaterThan(0);
  });
});
