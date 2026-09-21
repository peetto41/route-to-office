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
 * Deliberately does NOT look like a real Google Maps Platform key (real keys
 * follow the `AIza[0-9A-Za-z_-]{35}` shape gitleaks' default ruleset already
 * flags) so it can never be mistaken for a leaked secret by gitleaks or a
 * human reviewing a diff — the *value itself* isn't sensitive, only whether
 * it ever appears in a response is (see `test/key-leak.e2e-spec.ts`).
 */
export const TEST_API_KEY = 'FAKE-test-google-maps-key-not-real';

export function setTestEnv(): void {
  process.env.GOOGLE_MAPS_SERVER_API_KEY = TEST_API_KEY;
  process.env.COMPANY_NAME = 'Test Co';
  process.env.COMPANY_LAT = '13.7469';
  process.env.COMPANY_LNG = '100.5390';
  process.env.CORS_ORIGIN = 'http://localhost:3001';
  process.env.PORT = '3000';
}
