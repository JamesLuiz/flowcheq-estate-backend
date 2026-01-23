import { IsOptional, IsString, MaxLength, IsNumber, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class BankAccountDto {
  @ApiProperty({ example: 'First Bank', required: true })
  @IsString()
  bankName: string;

  @ApiProperty({ example: '1234567890', required: true })
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: 'John Doe', required: true })
  @IsString()
  accountName: string;

  @ApiProperty({ example: '011', required: true })
  @IsString()
  bankCode: string;
}

class CompanyDetailsDto {
  @ApiProperty({ example: 'Acme Estates Ltd', required: false })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiProperty({ example: 'RC123456', required: false })
  @IsString()
  @IsOptional()
  cacNumber?: string;

  @ApiProperty({ example: 'info@acme.com', required: false })
  @IsString()
  @IsOptional()
  businessEmail?: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/.../cac.pdf', required: false })
  @IsString()
  @IsOptional()
  cacDocumentUrl?: string;
}

export class UpdateAgentProfileDto {
  @ApiProperty({ example: 'Eliezer James', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: '+2348093117933', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'Experienced real estate agent', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  bio?: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', required: false })
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  verified?: boolean;

  @ApiProperty({ example: 'approved', required: false })
  @IsString()
  @IsOptional()
  verificationStatus?: string;

  @ApiProperty({ example: '2025-12-31T00:00:00.000Z', required: false })
  @IsOptional()
  verificationDate?: Date;

  @ApiProperty({ example: 'persona_inquiry_123', required: false })
  @IsString()
  @IsOptional()
  personaInquiryId?: string;

  @ApiProperty({ type: BankAccountDto, required: false })
  @ValidateNested()
  @Type(() => BankAccountDto)
  @IsOptional()
  bankAccount?: BankAccountDto;

  @ApiProperty({ example: 'active', required: false, enum: ['active', 'suspended', 'banned'] })
  @IsString()
  @IsOptional()
  accountStatus?: 'active' | 'suspended' | 'banned';

  @ApiProperty({ example: '2025-12-31T00:00:00.000Z', required: false })
  @IsOptional()
  suspendedUntil?: Date;

  @ApiProperty({ example: 'Violation of terms', required: false })
  @IsString()
  @IsOptional()
  suspensionReason?: string;

  @ApiProperty({ type: CompanyDetailsDto, required: false })
  @ValidateNested()
  @Type(() => CompanyDetailsDto)
  @IsOptional()
  companyDetails?: CompanyDetailsDto;

  @ApiProperty({ example: 'pending', required: false, enum: ['pending', 'approved', 'rejected'] })
  @IsString()
  @IsOptional()
  companyVerificationStatus?: 'pending' | 'approved' | 'rejected';
}

