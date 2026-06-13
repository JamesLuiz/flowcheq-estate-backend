import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum NotificationType {
  PropertyView = 'property_view',
  PropertyEnquiry = 'property_enquiry',
  Message = 'message',
  ManagementRequest = 'management_request',
  ManagementResponse = 'management_response',
  ViewingScheduled = 'viewing_scheduled',
  ViewingUpdated = 'viewing_updated',
  ListingVerified = 'listing_verified',
  ListingRejected = 'listing_rejected',
  System = 'system',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ enum: NotificationType, required: true, index: true })
  type: NotificationType;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  body?: string;

  /** Front-end route to open when clicked, e.g. /messages or /landlord/dashboard */
  @Prop({ trim: true })
  link?: string;

  /** Arbitrary structured payload (propertyId, viewerId, threadId, etc.) */
  @Prop({ type: Object })
  data?: Record<string, unknown>;

  @Prop({ default: false, index: true })
  read: boolean;

  @Prop()
  readAt?: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
