import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import { CompanyController } from './company.controller';

/**
 * `GET /api/v1/company` reads `COMPANY_*` straight from config and makes no
 * upstream call at all (see references/backend-nestjs.md's module layout
 * comment on `company.controller.ts`). This is a plain, synchronous unit test
 * rather than an e2e one specifically to prove that last part: the
 * controller is built here with *only* a `ConfigService` fake — no
 * `GoogleMapsHttpClient`/`RoutesService`/`GeocodingService` collaborator
 * exists for it to have accidentally started depending on.
 */
describe('CompanyController', () => {
  it('returns COMPANY_NAME/COMPANY_LAT/COMPANY_LNG from config', () => {
    const configValues: Record<string, unknown> = {
      COMPANY_NAME: 'Acme Co',
      COMPANY_LAT: 13.7469,
      COMPANY_LNG: 100.539,
    };
    const get = jest.fn((key: keyof EnvironmentVariables) => {
      if (!(key in configValues)) {
        throw new Error(`unexpected config key requested in test: ${key}`);
      }
      return configValues[key];
    });
    const configService = {
      get,
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const controller = new CompanyController(configService);

    const result = controller.getCompany();

    expect(result).toEqual({
      name: 'Acme Co',
      lat: 13.7469,
      lng: 100.539,
    });
    expect(get).toHaveBeenCalledWith('COMPANY_NAME', { infer: true });
    expect(get).toHaveBeenCalledWith('COMPANY_LAT', { infer: true });
    expect(get).toHaveBeenCalledWith('COMPANY_LNG', { infer: true });
  });

  it('is a synchronous read with no other collaborator to make an upstream call through', () => {
    // The controller's constructor signature only accepts a ConfigService —
    // if it ever grew a dependency on RoutesService/GeocodingService/
    // GoogleMapsHttpClient (i.e. started calling an upstream service), this
    // would need updating, which is the point: it forces that change to be
    // deliberate rather than silent.
    expect(CompanyController.length).toBe(1);
  });
});
