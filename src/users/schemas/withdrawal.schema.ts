import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WithdrawalDocument = Withdrawal & Document;

@Schema({ timestamps: true })
export class Withdrawal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Number, min: 100 })
  amount: number;

  @Prop({ required: true })
  bankName: string;

  @Prop({ required: true })
  accountNumber: string;

  @Prop({ required: true })
  accountName: string;

  @Prop({ required: true })
  bankCode: string;

  @Prop({ required: true, unique: true })
  reference: string;

  @Prop()
  transferId?: string;

  @Prop({ 
    required: true, 
    enum: ['pending', 'processing', 'successful', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop()
  failureReason?: string;

  @Prop()
  completedAt?: Date;
}

export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal);
