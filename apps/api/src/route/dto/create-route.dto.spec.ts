import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
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
});
