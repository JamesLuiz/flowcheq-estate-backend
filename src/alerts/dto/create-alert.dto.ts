import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateAlertDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  minPrice?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  @ValidateIf((o) => o.maxPrice == null || o.maxPrice >= o.minPrice)
  maxPrice?: number;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsNumber()
  @IsOptional()
  radius?: number;
}

