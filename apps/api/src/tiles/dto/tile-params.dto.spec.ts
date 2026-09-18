import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TileParamsDto } from './tile-params.dto';

async function validateParams(params: Record<string, unknown>) {
  // Path params always arrive as strings, matching how Nest hands them to
  // the DTO under the global ValidationPipe.
  const instance = plainToInstance(TileParamsDto, params);
  return validate(instance);
}

describe('TileParamsDto (DTO validation)', () => {
  it('accepts valid in-bounds tile coordinates', async () => {
    const errors = await validateParams({ z: '1', x: '0', y: '0' });
    expect(errors).toHaveLength(0);
  });

  it('accepts the maximum valid x/y for a given zoom', async () => {
    // z=2 => 0 <= x, y < 4
    const errors = await validateParams({ z: '2', x: '3', y: '3' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative zoom', async () => {
    const errors = await validateParams({ z: '-1', x: '0', y: '0' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a zoom above the configured maximum', async () => {
    const errors = await validateParams({ z: '23', x: '0', y: '0' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects x out of bounds for the given zoom', async () => {
    // z=1 => 0 <= x, y < 2
    const errors = await validateParams({ z: '1', x: '5', y: '0' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects y out of bounds for the given zoom', async () => {
    const errors = await validateParams({ z: '1', x: '0', y: '99999999' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a negative x', async () => {
    const errors = await validateParams({ z: '5', x: '-1', y: '0' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-integer path segments', async () => {
    const errors = await validateParams({ z: 'abc', x: '0', y: '0' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
