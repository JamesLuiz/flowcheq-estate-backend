import { IsString, IsNumber, IsDateString, IsNotEmpty, Min, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePromotionDto {
  @ApiProperty({ example: '64a1f2e7b9a5a3f1d0e4c2b1' })
  @IsMongoId()
  @IsNotEmpty()
  houseId: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/.../banner.jpg' })
  @IsString()
  @IsNotEmpty()
  bannerImage: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: 7, minimum: 1 })
  @IsNumber()
  @Min(1)
  days: number;

  @ApiProperty({ example: 70000, minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'FLW-TRX-123456' })
  @IsString()
  @IsNotEmpty()
  paymentReference: string;
}

