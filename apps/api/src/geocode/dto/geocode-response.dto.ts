export interface GeocodeResultDto {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * `GET /api/v1/geocode` returns up to 5 candidates rather than auto-picking
 * one — see SKILL.md's `GET /api/v1/geocode` contract. An empty `results`
 * array is a normal "not found" response, not an error.
 */
export interface GeocodeResponseDto {
  results: GeocodeResultDto[];
}
