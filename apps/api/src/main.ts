import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemJsonFilter } from './common/filters/problem-json.filter';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // process.env is already validated by ConfigModule.forRoot({ validate })
  // (see config/env.validation.ts) before this line runs — a missing or
  // malformed required variable throws during module initialization, so the
  // app fails fast at startup rather than inside a request handler.
  const configService = app.get(ConfigService<EnvironmentVariables, true>);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new ProblemJsonFilter());
  app.enableCors({ origin: configService.get('CORS_ORIGIN', { infer: true }) });

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
