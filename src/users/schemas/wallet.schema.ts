import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true, unique: true })
  userID: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop()
  accountNumber?: string; // Virtual account NUBAN

  @Prop()
  accountName?: string;

  @Prop()
  barter_id?: string;

  @Prop()
  bankCode?: string;

  @Prop()
  bankName?: string;

  @Prop({ unique: true, index: true })
  customerCode?: string; // account_reference from Flutterwave

  @Prop()
  subaccountId?: string; // Subaccount ID (e.g., RS_xxx) for split payments

  @Prop({ default: 'NGN' })
  currency: string;

  @Prop({ default: 0, min: 0 })
  balance: number; // Local balance tracking

  @Prop({ default: 'ACTIVE' })
  status: string; // ACTIVE, INACTIVE, SUSPENDED
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

