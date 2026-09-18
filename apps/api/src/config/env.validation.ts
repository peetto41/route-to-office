import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Shape of `process.env` this service requires to start. Validated once at
 * bootstrap (see `main.ts` / `ConfigModule.forRoot({ validate })`) so a
 * missing/invalid variable fails fast instead of surfacing as a runtime error
 * deep inside a request handler.
 */
export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  ORS_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  COMPANY_NAME!: string;

  @Type(() => Number)
  @IsLatitude()
  COMPANY_LAT!: number;

  @Type(() => Number)
  @IsLongitude()
  COMPANY_LNG!: number;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;
}

/**
 * Passed to `ConfigModule.forRoot({ validate })`. Throws synchronously on
 * startup if a required variable is missing or malformed — deliberately does
 * not include raw env values in the thrown error (class-validator's default
 * messages reference property names/constraints, not values).
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${messages}`);
  }

  return validated;
}
