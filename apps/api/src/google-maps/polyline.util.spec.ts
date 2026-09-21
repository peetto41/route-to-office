import { decodePolyline } from './polyline.util';

describe('decodePolyline', () => {
  it("decodes Google's own documented example into [lng, lat] pairs, not swapped", () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    // Documented as decoding to (lat, lng): (38.5,-120.2), (40.7,-120.95),
    // (43.252,-126.453).
    const result = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(result).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('decodes a single-point polyline', () => {
    // Encodes (lat=0, lng=0).
    expect(decodePolyline('??')).toEqual([[0, 0]]);
  });
});
