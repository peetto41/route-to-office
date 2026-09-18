import { IsNotEmpty, IsString, Length } from 'class-validator';

// Same bound as OriginDto's address field — an address this long is not a
// real query, it's either a mistake or an attempt to abuse the (billed)
// Geocoding API with an oversized payload.
export const MAX_ADDRESS_LENGTH = 200;

export class GeocodeQueryDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, MAX_ADDRESS_LENGTH)
  address!: string;
}
