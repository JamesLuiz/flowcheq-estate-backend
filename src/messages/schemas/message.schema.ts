import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { House } from '../../houses/schemas/house.schema';

@Schema({
  timestamps: true,
})
export class Message {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  senderId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  receiverId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: House.name,
    index: true,
  })
  houseId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  content: string;

  @Prop({ default: false })
  read: boolean;

  @Prop({
    type: String,
    enum: ['tenant-agent', 'co-tenant'],
    default: 'tenant-agent',
  })
  conversationType: 'tenant-agent' | 'co-tenant';
}

export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);

// Index for efficient conversation queries
MessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
MessageSchema.index({ houseId: 1, createdAt: -1 });
