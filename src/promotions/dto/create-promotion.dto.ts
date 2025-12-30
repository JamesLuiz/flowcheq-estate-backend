import { IsString, IsNumber, IsDateString, IsNotEmpty, Min, IsMongoId } from 'class-validator';

export class CreatePromotionDto {
  @IsMongoId()
  @IsNotEmpty()
  houseId: string;

  @IsString()
  @IsNotEmpty()
  bannerImage: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsNumber()
  @Min(1)
  days: number;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsNotEmpty()
  paymentReference: string;
}

