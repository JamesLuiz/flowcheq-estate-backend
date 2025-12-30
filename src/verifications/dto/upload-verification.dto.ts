import { IsEnum, IsNotEmpty } from 'class-validator';
import { DocumentType } from '../schemas/verification.schema';

export class UploadVerificationDto {
  @IsEnum(DocumentType)
  @IsNotEmpty()
  documentType: DocumentType;
}

