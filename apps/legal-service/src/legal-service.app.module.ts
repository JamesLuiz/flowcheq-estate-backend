import { Module } from '@nestjs/common';
import { LegalDocumentsModule } from '../../../src/legal-documents/legal-documents.module';

@Module({
  imports: [LegalDocumentsModule],
})
export class LegalServiceAppModule {}
