import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ManagementRequestStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Revoked = 'revoked',
}

@Schema({ timestamps: true })
export class ManagementRequest {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  propertyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  agentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  landlordId: Types.ObjectId;

  @Prop({ trim: true })
  message?: string;

  @Prop({
    enum: ManagementRequestStatus,
    default: ManagementRequestStatus.Pending,
    index: true,
  })
  status: ManagementRequestStatus;

  @Prop()
  respondedAt?: Date;

  @Prop({ trim: true })
  responseNote?: string;
}

export type ManagementRequestDocument = HydratedDocument<ManagementRequest>;
export const ManagementRequestSchema =
  SchemaFactory.createForClass(ManagementRequest);

ManagementRequestSchema.index({ propertyId: 1, agentId: 1, status: 1 });
