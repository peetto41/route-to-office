/**
 * Deliberately has zero imports (in particular, nothing from `@nestjs/*` or
 * `../../src/**`). `ConfigModule.forRoot({ validate })` runs its validation
 * against `process.env` the moment `AppModule` is imported (it's evaluated
 * as part of the `@Module({...})` decorator's argument, not deferred to
 * `TestingModule#compile()`) — so these env vars must be set *before*
 * anything imports `AppModule`, which for Jest means from a `setupFiles`
 * entry (see `jest-setup-env.ts`), which runs before a test file's own
 * `import`s are evaluated. If this file pulled in Nest itself, that import
 * would risk triggering the exact ordering problem it exists to avoid.
 */

/**
 * Deliberately does NOT look like a real ORS API key (real ORS v2 dashboard
 * keys are a base64-encoded JSON blob starting with `eyJvcmci` — see
 * .gitleaks.toml's narrow rule for that pattern) so it can never be mistaken
 * for a leaked secret by gitleaks or a human reviewing a diff — the *value
 * itself* isn't sensitive, only whether it ever appears in a response is
 * (see `test/key-leak.e2e-spec.ts`).
 */
export const TEST_API_KEY = 'eyJvcmci-fake-test-key';

export function setTestEnv(): void {
  process.env.ORS_API_KEY = TEST_API_KEY;
  process.env.COMPANY_NAME = 'Test Co';
  process.env.COMPANY_LAT = '13.7469';
  process.env.COMPANY_LNG = '100.5390';
  process.env.CORS_ORIGIN = 'http://localhost:3001';
  process.env.PORT = '3000';
}
