import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class FilterHousesDto {
  @ApiProperty({ example: 5000000, description: 'Minimum price filter', required: false })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  minPrice?: number;

  @ApiProperty({ example: 20000000, description: 'Maximum price filter', required: false })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  maxPrice?: number;

  @ApiProperty({ example: 'Lekki, Lagos', description: 'Location filter', required: false })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ example: 'Apartment', description: 'Property type filter', required: false })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ example: '3 bedroom', description: 'Search query for title/description', required: false })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ example: 20, description: 'Number of results to return', minimum: 1, maximum: 100, required: false })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  limit?: number;

  @ApiProperty({ example: 0, description: 'Number of results to skip', minimum: 0, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  skip?: number;

  @ApiProperty({ example: true, description: 'Filter for featured properties', required: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? value === 'true' || value === true : value,
  )
  featured?: boolean;

  @ApiProperty({ example: '64a1f2e9c...', description: 'Filter by agent ID', required: false })
  @IsMongoId()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ example: 6.5244, description: 'Latitude for location-based search', required: false })
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  lat?: number;

  @ApiProperty({ example: 3.3792, description: 'Longitude for location-based search', required: false })
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  lng?: number;

  @ApiProperty({ example: 10, description: 'Radius in kilometers for location-based search', required: false })
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  radius?: number; // in kilometers
}

