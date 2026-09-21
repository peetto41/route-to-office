import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import {
  GoogleMapsApiError,
  GoogleMapsHttpClient,
} from './google-maps-http.client';

/**
 * Regression test for the prior security finding that outbound calls had no
 * timeout (see this file's own `REQUEST_TIMEOUT_MS` doc comment and
 * references/backend-nestjs.md's timeout requirement). Same approach the old
 * `ors-http.client.spec.ts` used: spy on `AbortSignal.timeout` to shorten the
 * real delay for the test, but let the genuine abort mechanism run, so a
 * hanging upstream is proven to actually get cut off rather than hang the
 * request handler forever.
 */
describe('GoogleMapsHttpClient', () => {
  const realAbortSignalTimeout = AbortSignal.timeout.bind(AbortSignal);
  let timeoutSpy: jest.SpyInstance;

  function buildClient() {
    const configService = {
      get: jest.fn(() => 'fake-key'),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    return new GoogleMapsHttpClient(configService);
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

  it('sends the API key as a `key` query parameter, never as a header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'OK' }),
    });
    global.fetch = fetchMock;
    const client = buildClient();

    await client.getJson('https://maps.googleapis.com/maps/api/geocode/json', {
      address: 'Siam Paragon',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(calledUrl as string);
    expect(url.searchParams.get('key')).toBe('fake-key');
    expect(url.searchParams.get('address')).toBe('Siam Paragon');
    expect((init as RequestInit | undefined)?.headers).toBeUndefined();
  });

  it('aborts a hanging GET instead of waiting on it forever', async () => {
    const fetchMock = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = buildClient();

    await expect(
      client.getJson('https://maps.googleapis.com/maps/api/geocode/json', {
        address: 'Siam Paragon',
      }),
    ).rejects.toBeInstanceOf(GoogleMapsApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }, 2_000);

  it('wraps a non-2xx HTTP response into a GoogleMapsApiError carrying only the status code', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'should never be read' }),
    });
    global.fetch = fetchMock;
    const client = buildClient();

    await expect(
      client.getJson('https://maps.googleapis.com/maps/api/geocode/json', {}),
    ).rejects.toMatchObject({ upstreamStatus: 503 });
  });

  it('wraps a network failure into a GoogleMapsApiError with an undefined status', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock;
    const client = buildClient();

    await expect(
      client.getJson('https://maps.googleapis.com/maps/api/geocode/json', {}),
    ).rejects.toMatchObject({ upstreamStatus: undefined });
  });
});
