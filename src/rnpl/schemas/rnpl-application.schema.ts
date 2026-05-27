import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class RnplApplication {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  propertyId: string;

  @Prop({ required: true, index: true })
  landlordId: string;

  @Prop({ required: true })
  annualRentAmount: number;

  @Prop({ required: true })
  requestedLoanAmount: number;

  @Prop({ required: true })
  monoAccountId: string;

  @Prop({ type: Date })
  monoVerifiedAt?: Date;

  @Prop({
    type: String,
    enum: ['checking', 'eligible', 'ineligible', 'pending_bank_review'],
    default: 'checking',
    index: true,
  })
  eligibilityStatus: string;

  @Prop({ type: Number, default: null })
  eligibilityScore?: number;

  @Prop({ default: 'Bank Partner' })
  bankPartnerName?: string;

  @Prop({ type: String, default: null })
  bankLoanReference?: string;

  @Prop({
    type: String,
    enum: ['not_submitted', 'submitted', 'approved', 'rejected', 'disbursed'],
    default: 'not_submitted',
  })
  bankLoanStatus?: string;
}

export type RnplApplicationDocument = HydratedDocument<RnplApplication>;
export const RnplApplicationSchema = SchemaFactory.createForClass(RnplApplication);
