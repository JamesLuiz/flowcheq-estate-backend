import {
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CoordinatesDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

export class CreateHouseDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsMongoId()
  @IsOptional()
  agentId?: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  @IsOptional()
  coordinates?: CoordinatesDto;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  bedrooms?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  bathrooms?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  area?: number;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  featured?: boolean;
}

