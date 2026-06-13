import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum PartnerLeadStatus {
  New = 'new',
  Contacted = 'contacted',
  Converted = 'converted',
  NotInterested = 'not_interested',
}

@Schema({ timestamps: true })
export class PartnerLead {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, trim: true, index: true })
  phone: string;

  @Prop({ required: true })
  dateOfBirth: Date;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true, default: 'FCT' })
  state?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ type: Number, min: 0 })
  propertyCount?: number;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true, default: 'partners-form' })
  source?: string;

  @Prop({
    enum: PartnerLeadStatus,
    default: PartnerLeadStatus.New,
    index: true,
  })
  status: PartnerLeadStatus;

  @Prop({ trim: true })
  adminNotes?: string;

  @Prop()
  lastContactedAt?: Date;

  @Prop({ enum: ['email', 'whatsapp', 'phone'], default: 'email' })
  lastContactChannel?: string;
}

export type PartnerLeadDocument = HydratedDocument<PartnerLead>;
export const PartnerLeadSchema = SchemaFactory.createForClass(PartnerLead);

PartnerLeadSchema.index({ createdAt: -1 });
PartnerLeadSchema.index({ email: 1, phone: 1 });
