import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateManagementRequestDto {
  @IsMongoId()
  propertyId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;
}
