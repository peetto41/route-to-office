import { setTestEnv } from './test-env';

// Runs as a Jest `setupFiles` entry (see test/jest-e2e.json) — i.e. before a
// test file's own imports are evaluated, which is what guarantees
// `AppModule` never sees an unset `GOOGLE_MAPS_SERVER_API_KEY` (see
// test-env.ts's doc comment for why import order matters here).
setTestEnv();
