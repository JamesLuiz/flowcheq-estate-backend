import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VerificationStatus } from '../schemas/verification.schema';

export class ReviewVerificationDto {
  @ApiProperty({ enum: VerificationStatus, example: VerificationStatus.APPROVED, description: 'Verification status' })
  @IsEnum(VerificationStatus)
  @IsNotEmpty()
  status: VerificationStatus;

  @ApiProperty({ example: 'Document quality is too low', description: 'Reason for rejection', required: false })
  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @ApiProperty({ example: 'Please resubmit with a clearer document photo', description: 'Message from admin to user', required: false })
  @IsString()
  @IsOptional()
  adminMessage?: string;
}

