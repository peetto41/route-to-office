import { UpstreamMapsException } from '../common/exceptions/upstream-maps.exception';
import { OsmTileClient } from './osm-tile.client';

/**
 * Regression test for the prior security finding that outbound calls had no
 * timeout (see this file's own `REQUEST_TIMEOUT_MS` doc comment and
 * references/backend-nestjs.md's "Set a timeout/AbortController on every
 * outbound HTTP call" requirement). Proves a hanging upstream actually gets
 * aborted rather than tying up the request handler forever — not just that
 * `AbortSignal.timeout(...)` appears in the source.
 *
 * `AbortSignal.timeout` is spied so the *real* abort-after-N-ms mechanism
 * still runs (this is not a fake-timer trick that could pass even if the
 * production code never wired the signal into `fetch`), just with a much
 * shorter real-world delay than the production `8_000`ms so the test suite
 * doesn't have to wait 8 seconds to prove it.
 */
describe('OsmTileClient timeout handling', () => {
  const realAbortSignalTimeout = AbortSignal.timeout.bind(AbortSignal);
  let timeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => realAbortSignalTimeout(30));
  });

  afterEach(() => {
    timeoutSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('aborts a hanging fetch instead of waiting on it forever, surfacing as UpstreamMapsException', async () => {
    const fetchMock = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          // Mirrors real `fetch`'s contract: it rejects once the passed
          // AbortSignal fires, it never resolves/rejects on its own.
          init?.signal?.addEventListener('abort', () => {
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OsmTileClient();

    await expect(client.getTile(1, 0, 0)).rejects.toBeInstanceOf(
      UpstreamMapsException,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }, 2_000);
});
