import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LegalDocument, LegalDocumentSchema } from './schemas/legal-document.schema';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalDocumentsController } from './legal-documents.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LegalDocument.name, schema: LegalDocumentSchema },
    ]),
  ],
  providers: [LegalDocumentsService],
  controllers: [LegalDocumentsController],
  exports: [LegalDocumentsService],
})
export class LegalDocumentsModule {}
