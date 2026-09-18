import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GeocodeQueryDto } from './geocode-query.dto';

async function validateQuery(query: unknown) {
  const instance = plainToInstance(GeocodeQueryDto, query);
  return validate(instance);
}

describe('GeocodeQueryDto (DTO validation)', () => {
  it('accepts a normal address', async () => {
    const errors = await validateQuery({ address: '1 Somewhere Rd, Bangkok' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing address', async () => {
    const errors = await validateQuery({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty address', async () => {
    const errors = await validateQuery({ address: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an oversized address', async () => {
    const errors = await validateQuery({ address: 'x'.repeat(201) });
    expect(errors.length).toBeGreaterThan(0);
  });
});
