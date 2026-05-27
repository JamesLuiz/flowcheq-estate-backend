import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class LegalDocument {
  @Prop({ required: true, index: true })
  propertyId: string;

  @Prop({ required: true, index: true })
  landlordId: string;

  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true })
  templateVersion: string;

  @Prop({ required: true })
  state: string;

  @Prop({
    type: String,
    enum: ['draft', 'awaiting_tenant_signature', 'awaiting_landlord_signature', 'fully_executed', 'expired', 'disputed'],
    default: 'draft',
    index: true,
  })
  status: string;

  @Prop({ type: String, default: null })
  documentUrl?: string;

  @Prop({ type: String, default: null })
  documentHash?: string;

  @Prop({ default: 'pending', enum: ['pending', 'paid'] })
  paymentStatus?: string;

  @Prop({ default: 1500000 })
  paymentAmount?: number;

  @Prop({ type: Object, default: {} })
  signatures?: Record<string, unknown>;

  @Prop({ type: [Object], default: [] })
  auditTrail?: Record<string, unknown>[];
}

export type LegalDocumentDocument = HydratedDocument<LegalDocument>;
export const LegalDocumentSchema = SchemaFactory.createForClass(LegalDocument);
