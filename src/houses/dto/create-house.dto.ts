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
import { ApiProperty } from '@nestjs/swagger';

class CoordinatesDto {
  @ApiProperty({ example: 6.5244 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 3.3792 })
  @IsNumber()
  lng: number;
}

export class CreateHouseDto {
  @ApiProperty({ example: '3 bedroom flat in Lekki' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Spacious apartment with balcony and good lighting' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 15000000 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ example: 'Lekki, Lagos' })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiProperty({ example: 'Apartment' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: ['https://example.com/img1.jpg'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiProperty({ example: '640b1f2e9c...' , required: false })
  @IsMongoId()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ type: CoordinatesDto, required: false })
  @ValidateNested()
  @Type(() => CoordinatesDto)
  @IsOptional()
  coordinates?: CoordinatesDto;

  @ApiProperty({ example: 3, required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  bedrooms?: number;

  @ApiProperty({ example: 2, required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  bathrooms?: number;

  @ApiProperty({ example: 120, required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  area?: number;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  featured?: boolean;
}

