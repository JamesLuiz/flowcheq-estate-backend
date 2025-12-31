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
}

export const ViewingSchema = SchemaFactory.createForClass(Viewing);
