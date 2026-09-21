import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';

export interface CompanyResponseDto {
  name: string;
  lat: number;
  lng: number;
}

/**
 * `GET /api/v1/company` — reads `COMPANY_*` from env, no upstream call
 * involved. Deliberately carries no `@Throttle()` override: it stays under
 * the generous module-wide default throttler configured in `app.module.ts`
 * rather than the tight per-route limit applied to the Google-Maps-backed
 * endpoints (see `references/backend-nestjs.md`'s "Rate limiting" section),
 * since it can't burn through the Google Maps Platform quota.
 */
@Controller('company')
export class CompanyController {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get()
  getCompany(): CompanyResponseDto {
    return {
      name: this.configService.get('COMPANY_NAME', { infer: true }),
      lat: this.configService.get('COMPANY_LAT', { infer: true }),
      lng: this.configService.get('COMPANY_LNG', { infer: true }),
    };
  }
}
