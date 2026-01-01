import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAlertDto {
  @ApiProperty({ example: 5000000, description: 'Minimum price filter', required: false })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  minPrice?: number;

  @ApiProperty({ example: 20000000, description: 'Maximum price filter', required: false })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  @ValidateIf((o) => o.maxPrice == null || o.maxPrice >= o.minPrice)
  maxPrice?: number;

  @ApiProperty({ example: 'Lekki, Lagos', description: 'Location filter', required: false })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ example: 'Apartment', description: 'Property type filter', required: false })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ example: 6.5244, description: 'Latitude for location-based alerts', required: false })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiProperty({ example: 3.3792, description: 'Longitude for location-based alerts', required: false })
  @IsNumber()
  @IsOptional()
  lng?: number;

  @ApiProperty({ example: 10, description: 'Radius in kilometers for location-based alerts', required: false })
  @IsNumber()
  @IsOptional()
  radius?: number;
}

