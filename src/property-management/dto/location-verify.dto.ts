import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class LocationVerifyDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsNumber()
  accuracy: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
