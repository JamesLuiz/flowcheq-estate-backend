import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ required: true, index: true })
  landlordId: string;

  @Prop({ required: true, enum: ['free', 'basic', 'pro'], default: 'free' })
  tier: string;

  @Prop({ required: true, enum: ['active', 'cancelled', 'expired', 'past_due'], default: 'active' })
  status: string;

  @Prop({ required: true, enum: ['monthly', 'annual'], default: 'monthly' })
  billingCycle: string;

  @Prop({ required: true })
  currentPeriodStart: Date;

  @Prop({ required: true })
  currentPeriodEnd: Date;

  @Prop()
  paymentReference?: string;

  @Prop({ default: true })
  autoRenew?: boolean;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date;

  @Prop({ type: String, default: null })
  cancelReason?: string;
}

export type SubscriptionDocument = HydratedDocument<Subscription>;
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
