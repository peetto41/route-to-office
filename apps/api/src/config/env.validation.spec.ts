import { validateEnv } from './env.validation';

/**
 * Confirms the app fails fast at startup on invalid/missing config rather
 * than surfacing lazily inside a request handler (see
 * references/backend-nestjs.md's "Config" section: "Validate `process.env`
 * at startup ... rather than failing lazily"). `validateEnv` is exactly what
 * `ConfigModule.forRoot({ validate })` calls during `AppModule`
 * initialization (see `test/utils/test-app.ts`'s doc comment on this same
 * mechanism), so testing it directly here is equivalent to testing that Nest
 * refuses to boot.
 */
describe('validateEnv', () => {
  function validEnv(): Record<string, unknown> {
    return {
      ORS_API_KEY: 'eyJvcmci-fake-test-key',
      COMPANY_NAME: 'Test Co',
      COMPANY_LAT: '13.7469',
      COMPANY_LNG: '100.5390',
      CORS_ORIGIN: 'http://localhost:3001',
      PORT: '3000',
    };
  }

  it('accepts a fully valid environment', () => {
    expect(() => validateEnv(validEnv())).not.toThrow();
  });

  it('parses numeric fields as numbers, not strings', () => {
    const result = validateEnv(validEnv());
    expect(result.COMPANY_LAT).toBe(13.7469);
    expect(result.COMPANY_LNG).toBe(100.539);
    expect(result.PORT).toBe(3000);
  });

  it('applies the default PORT when it is omitted', () => {
    const env = validEnv();
    delete env.PORT;
    const result = validateEnv(env);
    expect(result.PORT).toBe(3000);
  });

  it('fails fast when ORS_API_KEY is missing', () => {
    const env = validEnv();
    delete env.ORS_API_KEY;
    expect(() => validateEnv(env)).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when ORS_API_KEY is empty', () => {
    const env = { ...validEnv(), ORS_API_KEY: '' };
    expect(() => validateEnv(env)).toThrow();
  });

  it('fails fast when COMPANY_LAT is missing', () => {
    const env = validEnv();
    delete env.COMPANY_LAT;
    expect(() => validateEnv(env)).toThrow();
  });

  it('fails fast when COMPANY_LNG is missing', () => {
    const env = validEnv();
    delete env.COMPANY_LNG;
    expect(() => validateEnv(env)).toThrow();
  });

  it('fails fast when COMPANY_LAT is out of valid latitude range', () => {
    const env = { ...validEnv(), COMPANY_LAT: '999' };
    expect(() => validateEnv(env)).toThrow();
  });

  it('fails fast when COMPANY_LNG is out of valid longitude range', () => {
    const env = { ...validEnv(), COMPANY_LNG: '999' };
    expect(() => validateEnv(env)).toThrow();
  });

  it('fails fast when CORS_ORIGIN is missing', () => {
    const env = validEnv();
    delete env.CORS_ORIGIN;
    expect(() => validateEnv(env)).toThrow();
  });

  it('never includes the raw ORS_API_KEY value in the thrown error message, even when validation fails on a different field', () => {
    const secretLookingKey = 'eyJvcmci-super-secret-value';
    const env = {
      ...validEnv(),
      ORS_API_KEY: secretLookingKey,
      COMPANY_LAT: '999',
    };
    try {
      validateEnv(env);
      throw new Error('expected validateEnv to throw');
    } catch (error) {
      expect((error as Error).message).not.toContain(secretLookingKey);
    }
  });
});
