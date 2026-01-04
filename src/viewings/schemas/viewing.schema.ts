import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ViewingDocument = Viewing & Document;

@Schema({ timestamps: true })
export class Viewing {
  @Prop({ type: Types.ObjectId, ref: 'House', required: true })
  houseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  agentId: Types.ObjectId;

  @Prop({ required: true })
  scheduledDate: string;

  @Prop({ required: true })
  scheduledTime: string;

  @Prop({ default: 'pending' })
  status: string; // pending, confirmed, cancelled, completed

  @Prop()
  notes?: string;

  // For non-logged-in users
  @Prop()
  guestName?: string;

  @Prop()
  guestEmail?: string;

  @Prop()
  guestPhone?: string;

  @Prop({ default: false })
  deleted?: boolean;

  // Payment and receipt fields
  @Prop({ type: Number, min: 0 })
  viewingFee?: number; // Fee amount in Naira

  @Prop({ default: 'unpaid' })
  paymentStatus?: string; // unpaid, pending, paid, failed

  @Prop()
  paymentReference?: string; // Flutterwave transaction reference

  @Prop()
  receiptUrl?: string; // URL to uploaded receipt image

  @Prop({ type: Number, min: 0 })
  amountPaid?: number; // Amount paid (after platform fee deduction)

  @Prop({ type: Number, min: 0 })
  platformFee?: number; // Platform fee percentage applied

  @Prop({ type: Number, min: 0 })
  agentAmount?: number; // Amount to be disbursed to agent
}

export const ViewingSchema = SchemaFactory.createForClass(Viewing);
