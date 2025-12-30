import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VerificationStatus } from '../schemas/verification.schema';

export class ReviewVerificationDto {
  @IsEnum(VerificationStatus)
  @IsNotEmpty()
  status: VerificationStatus;

  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @IsString()
  @IsOptional()
  adminMessage?: string;
}

