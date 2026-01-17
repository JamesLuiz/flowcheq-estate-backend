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

  @ApiProperty({
    example: [
      { url: 'https://example.com/kitchen.jpg', tag: 'kitchen', description: 'Modern kitchen with island' },
      { url: 'https://example.com/bedroom.jpg', tag: 'bedroom', description: 'Master bedroom' },
    ],
    required: false,
    description: 'Tagged photos with room types and descriptions (max 8)',
  })
  @IsArray()
  @IsOptional()
  taggedPhotos?: Array<{
    url: string;
    tag: string;
    description?: string;
  }>;

  @ApiProperty({ example: '640b1f2e9c...', required: false })
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

  // Shared Property (2-to-Tango) fields
  @ApiProperty({ example: false, required: false, description: 'Mark as shared property for multiple tenants' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isShared?: boolean;

  @ApiProperty({ example: 2, required: false, description: 'Number of available slots for shared property' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  totalSlots?: number;

  @ApiProperty({ example: 5000, required: false, description: 'Viewing/Tour fee in Naira' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  viewingFee?: number;

  @ApiProperty({ example: 'buy', required: false, description: 'Listing type: rent or buy', enum: ['rent', 'buy'] })
  @IsString()
  @IsOptional()
  listingType?: 'rent' | 'buy';

  @ApiProperty({ example: false, required: false, description: 'Mark as Airbnb listing' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isAirbnb?: boolean;

  @ApiProperty({ example: 'https://example.com/proof.pdf', required: false, description: 'URL to proof of address document' })
  @IsString()
  @IsOptional()
  proofOfAddress?: string;
}

