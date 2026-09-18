import { describe, expect, it } from 'vitest';
import { isWithinThailand, THAILAND_BOUNDS } from './thailand-bounds';

/**
 * Mirrors apps/api's equivalent spec
 * (`apps/api/src/common/validators/is-within-thailand-bounds.validator.spec.ts`)
 * so both tiers agree on what "just outside each edge" means for the same
 * four bbox numbers.
 */
describe('isWithinThailand', () => {
  it('accepts coordinates well inside the Thailand bounding box', () => {
    expect(isWithinThailand(13.7563, 100.5018)).toBe(true); // Bangkok
  });

  it('accepts coordinates exactly on the box edges', () => {
    expect(isWithinThailand(THAILAND_BOUNDS.minLat, THAILAND_BOUNDS.minLng)).toBe(true);
    expect(isWithinThailand(THAILAND_BOUNDS.maxLat, THAILAND_BOUNDS.maxLng)).toBe(true);
    expect(isWithinThailand(THAILAND_BOUNDS.minLat, THAILAND_BOUNDS.maxLng)).toBe(true);
    expect(isWithinThailand(THAILAND_BOUNDS.maxLat, THAILAND_BOUNDS.minLng)).toBe(true);
  });

  it('rejects a latitude just north of the box', () => {
    expect(isWithinThailand(THAILAND_BOUNDS.maxLat + 0.1, 100.5)).toBe(false);
  });

  it('rejects a latitude just south of the box', () => {
    expect(isWithinThailand(THAILAND_BOUNDS.minLat - 0.1, 100.5)).toBe(false);
  });

  it('rejects a longitude just east of the box', () => {
    expect(isWithinThailand(13.75, THAILAND_BOUNDS.maxLng + 0.1)).toBe(false);
  });

  it('rejects a longitude just west of the box', () => {
    expect(isWithinThailand(13.75, THAILAND_BOUNDS.minLng - 0.1)).toBe(false);
  });

  it('rejects coordinates on the wrong continent entirely (e.g. Taiwan)', () => {
    expect(isWithinThailand(25.03, 121.5)).toBe(false);
  });
});
