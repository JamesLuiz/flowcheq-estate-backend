import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAgentProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  bio?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsOptional()
  verified?: boolean;

  @IsString()
  @IsOptional()
  verificationStatus?: string;

  @IsOptional()
  verificationDate?: Date;

  @IsString()
  @IsOptional()
  personaInquiryId?: string;
}

