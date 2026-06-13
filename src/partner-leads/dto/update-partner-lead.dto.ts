import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PartnerLeadStatus } from '../schemas/partner-lead.schema';

export class UpdatePartnerLeadDto {
  @ApiProperty({ enum: PartnerLeadStatus, required: false })
  @IsOptional()
  @IsEnum(PartnerLeadStatus)
  status?: PartnerLeadStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

export class ContactPartnerLeadDto {
  @ApiProperty({ enum: ['email', 'whatsapp'] })
  @IsEnum(['email', 'whatsapp'])
  channel: 'email' | 'whatsapp';

  @ApiProperty({ example: 'Thanks for registering — we will call you this week.' })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiProperty({ required: false, example: 'Landlord onboarding follow-up' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;
}
