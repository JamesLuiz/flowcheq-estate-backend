import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { House } from '../../houses/schemas/house.schema';
import { User } from '../../users/schemas/user.schema';

export enum PromotionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Schema({
  timestamps: true,
})
export class Promotion {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: House.name,
    required: true,
    index: true,
  })
  houseId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  bannerImage: string; // Cloudinary URL

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, min: 1 })
  days: number; // Number of days promoted

  @Prop({ required: true, min: 0 })
  amount: number; // Amount paid in Naira

  @Prop({ required: true, trim: true })
  paymentReference: string; // Flutterwave transaction reference

  @Prop({
    type: String,
    enum: PromotionStatus,
    default: PromotionStatus.PENDING,
    index: true,
  })
  status: PromotionStatus;

  @Prop({ default: 0 })
  clicks: number; // Number of clicks on banner

  @Prop({ type: Date })
  activatedAt?: Date;

  @Prop({ type: Date })
  expiredAt?: Date;

  // Timestamps added by Mongoose when `timestamps: true` is set on the schema.
  // Declared here so TypeScript recognizes them on document instances.
  createdAt?: Date;
  updatedAt?: Date;
}

export type PromotionDocument = HydratedDocument<Promotion>;
export const PromotionSchema = SchemaFactory.createForClass(Promotion);

PromotionSchema.index({ houseId: 1, status: 1 });
PromotionSchema.index({ status: 1, startDate: 1, endDate: 1 });
PromotionSchema.index({ userId: 1 });

