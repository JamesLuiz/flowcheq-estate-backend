import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VerificationPaymentDocument = VerificationPayment & Document;

export const VERIFICATION_PAYMENT_STATUSES = [
  'awaiting_funding',
  'ready',
  'fee_debiting',
  'fee_debited',
  'youverify_pending',
  'verified',
  'failed',
  'refund_pending',
  'refunded',
] as const;

export type VerificationPaymentStatus = (typeof VERIFICATION_PAYMENT_STATUSES)[number];

@Schema({ _id: false })
export class VerificationPaymentEvent {
  @Prop({ required: true })
  status: string;

  @Prop({ default: () => new Date() })
  at: Date;

  @Prop()
  note?: string;

  @Prop({ type: Object })
  meta?: Record<string, unknown>;
}

@Schema({ timestamps: true })
export class VerificationPayment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Number, min: 0 })
  feeAmount: number;

  @Prop({ default: 'NGN' })
  currency: string;

  @Prop({
    required: true,
    enum: VERIFICATION_PAYMENT_STATUSES,
    default: 'awaiting_funding',
    index: true,
  })
  status: VerificationPaymentStatus;

  @Prop({ type: [VerificationPaymentEvent], default: [] })
  events: VerificationPaymentEvent[];

  @Prop()
  flutterwaveReference?: string;

  @Prop()
  flutterwaveTransferId?: string;

  @Prop()
  youverifyReference?: string;

  @Prop()
  failureReason?: string;

  @Prop()
  completedAt?: Date;

  /** KYC payload stored until Flutterwave fee debit is confirmed (webhook or poll) */
  @Prop({ type: Object })
  pendingVerification?: {
    documentType: 'nin' | 'driver_license';
    idNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    selfieUrl: string;
    role: string;
  };
}

export const VerificationPaymentSchema = SchemaFactory.createForClass(VerificationPayment);
VerificationPaymentSchema.index({ userId: 1, createdAt: -1 });
VerificationPaymentSchema.index({ flutterwaveReference: 1 });
