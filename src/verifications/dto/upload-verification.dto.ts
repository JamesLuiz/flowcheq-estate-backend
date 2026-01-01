import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '../schemas/verification.schema';

export class UploadVerificationDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.NIN, description: 'Type of document to upload' })
  @IsEnum(DocumentType)
  @IsNotEmpty()
  documentType: DocumentType;
}

