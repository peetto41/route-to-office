import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { THAILAND_BOUNDS } from '../../common/thailand-bounds.constants';
import { CreateRouteDto } from './create-route.dto';

async function validateBody(body: unknown) {
  const instance = plainToInstance(CreateRouteDto, body);
  return validate(instance);
}

describe('CreateRouteDto (DTO validation)', () => {
  it('accepts an origin given as coordinates, no destination', async () => {
    const errors = await validateBody({ origin: { lat: 13.75, lng: 100.5 } });
    expect(errors).toHaveLength(0);
  });

  it('accepts an origin given as a free-text address', async () => {
    const errors = await validateBody({
      origin: { address: '1 Somewhere Rd, Bangkok' },
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts an explicit destination as coordinates', async () => {
    const errors = await validateBody({
      origin: { lat: 13.75, lng: 100.5 },
      destination: { lat: 13.74, lng: 100.53 },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a latitude above 90', async () => {
    const errors = await validateBody({ origin: { lat: 91, lng: 100.5 } });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a latitude below -90', async () => {
    const errors = await validateBody({ origin: { lat: -91, lng: 100.5 } });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a longitude above 180', async () => {
    const errors = await validateBody({ origin: { lat: 13.75, lng: 181 } });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a longitude below -180', async () => {
    const errors = await validateBody({ origin: { lat: 13.75, lng: -200 } });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an origin with both an address and coordinates', async () => {
    const errors = await validateBody({
      origin: { address: 'Somewhere', lat: 13.75, lng: 100.5 },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an origin with neither an address nor coordinates', async () => {
    const errors = await validateBody({ origin: {} });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty address string', async () => {
    const errors = await validateBody({ origin: { address: '' } });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an oversized address', async () => {
    const errors = await validateBody({
      origin: { address: 'x'.repeat(201) },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a missing origin entirely', async () => {
    const errors = await validateBody({});
    expect(errors.length).toBeGreaterThan(0);
  });

  /**
   * Thailand-only bbox check (SKILL.md's "Thailand-only scope" section) —
   * applies to directly-supplied origin/destination coordinates only. Each
   * "just outside" case nudges exactly one edge past the box so a bug that
   * only checks lat *or* lng (not both) would still be caught.
   */
  describe('Thailand-only bounding box on directly-supplied coordinates', () => {
    it('accepts an origin inside the Thailand bounding box', async () => {
      const errors = await validateBody({
        origin: { lat: 13.7563, lng: 100.5018 },
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects an origin just north of the box', async () => {
      const errors = await validateBody({
        origin: { lat: THAILAND_BOUNDS.maxLat + 0.1, lng: 100.5 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects an origin just south of the box', async () => {
      const errors = await validateBody({
        origin: { lat: THAILAND_BOUNDS.minLat - 0.1, lng: 100.5 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects an origin just east of the box', async () => {
      const errors = await validateBody({
        origin: { lat: 13.75, lng: THAILAND_BOUNDS.maxLng + 0.1 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects an origin just west of the box', async () => {
      const errors = await validateBody({
        origin: { lat: 13.75, lng: THAILAND_BOUNDS.minLng - 0.1 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a destination outside the box even when origin is valid', async () => {
      const errors = await validateBody({
        origin: { lat: 13.7563, lng: 100.5018 },
        destination: { lat: THAILAND_BOUNDS.maxLat + 0.1, lng: 100.5 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('does not apply the bbox check to the geocode-resolved address branch of origin', async () => {
      // A free-text address is geocoded server-side and is already
      // guaranteed Thailand-only via GeocodingService's country filter — the
      // bbox check only applies to directly-supplied { lat, lng }, per
      // SKILL.md's "Thailand-only scope" section. No lat/lng is present here
      // at all, so there is nothing for the bbox validator to reject.
      const errors = await validateBody({
        origin: { address: 'Some address the geocoder will resolve' },
      });
      expect(errors).toHaveLength(0);
    });
  });
});
