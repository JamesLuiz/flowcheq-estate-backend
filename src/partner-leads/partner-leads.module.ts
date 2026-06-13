import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PartnerLead, PartnerLeadSchema } from './schemas/partner-lead.schema';
import { PartnerLeadsService } from './partner-leads.service';
import { PartnerLeadsController } from './partner-leads.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PartnerLead.name, schema: PartnerLeadSchema }]),
    forwardRef(() => AuthModule),
  ],
  controllers: [PartnerLeadsController],
  providers: [PartnerLeadsService],
  exports: [PartnerLeadsService],
})
export class PartnerLeadsModule {}
