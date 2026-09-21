/**
 * Decodes a Google encoded-polyline string (precision 1e5 — the default for
 * the Directions API's `overview_polyline.points`) into an array of
 * coordinates.
 *
 * Returned in `[lng, lat]` order (GeoJSON's convention, and this app's own
 * `GeoJsonLineString.coordinates` contract) even though the polyline's own
 * delta-encoding decodes latitude before longitude for each point — the same
 * kind of boundary conversion this app already made explicit for
 * OpenRouteService's `[lon, lat]` coordinates; get it backwards and you get a
 * route on the wrong side of the planet, not an error.
 *
 * Algorithm reference:
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    lat += decodeSignedValue();
    lng += decodeSignedValue();
    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;

  function decodeSignedValue(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
  }
}
