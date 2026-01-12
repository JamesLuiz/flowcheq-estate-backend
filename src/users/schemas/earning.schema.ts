import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EarningDocument = Earning & Document;

@Schema({ timestamps: true })
export class Earning {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Number, min: 0 })
  amount: number;

  @Prop({ required: true, type: Number, min: 0 })
  grossAmount: number; // Original amount before platform fee

  @Prop({ required: true, type: Number, min: 0 })
  platformFee: number; // Platform fee percentage

  @Prop({ 
    required: true, 
    enum: ['viewing_fee', 'booking_fee', 'commission', 'other'],
    index: true,
  })
  type: string;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Viewing' })
  viewingId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'House' })
  houseId?: Types.ObjectId;

  @Prop()
  propertyTitle?: string;

  @Prop()
  clientName?: string;
}

export const EarningSchema = SchemaFactory.createForClass(Earning);
