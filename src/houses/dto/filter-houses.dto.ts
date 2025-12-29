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

export class FilterHousesDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  minPrice?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  maxPrice?: number;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  limit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  skip?: number;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? value === 'true' || value === true : value,
  )
  featured?: boolean;

  @IsMongoId()
  @IsOptional()
  agentId?: string;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  lat?: number;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  lng?: number;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  radius?: number; // in kilometers
}

