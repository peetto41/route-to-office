import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import { OrsApiError, OrsHttpClient } from './ors-http.client';

/**
 * Regression test for the prior security finding that outbound ORS calls had
 * no timeout (see this file's `REQUEST_TIMEOUT_MS` doc comment and
 * references/backend-nestjs.md's timeout requirement). Same approach as
 * `tiles/osm-tile.client.spec.ts`: spy on `AbortSignal.timeout` to shorten
 * the real delay for the test, but let the genuine abort mechanism run, so a
 * hanging upstream is proven to actually get cut off rather than hang the
 * request handler forever.
 */
describe('OrsHttpClient timeout handling', () => {
  const realAbortSignalTimeout = AbortSignal.timeout.bind(AbortSignal);
  let timeoutSpy: jest.SpyInstance;

  function buildClient() {
    const configService = {
      get: jest.fn(() => 'fake-key'),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    return new OrsHttpClient(configService);
  }

  function hangingFetchMock() {
    return jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        }),
    );
  }

  beforeEach(() => {
    timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => realAbortSignalTimeout(30));
  });

  afterEach(() => {
    timeoutSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('aborts a hanging POST instead of waiting on it forever', async () => {
    const fetchMock = hangingFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = buildClient();

    await expect(
      client.postJson(
        'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
        {},
      ),
    ).rejects.toBeInstanceOf(OrsApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }, 2_000);

  it('aborts a hanging GET instead of waiting on it forever', async () => {
    const fetchMock = hangingFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = buildClient();

    await expect(
      client.getJson('https://api.openrouteservice.org/geocode/search', {
        text: 'Siam Paragon',
      }),
    ).rejects.toBeInstanceOf(OrsApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }, 2_000);
});
