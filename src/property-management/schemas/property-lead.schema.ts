import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum PropertyLeadType {
  View = 'view',
  Enquiry = 'enquiry',
}

export enum PropertyLeadStatus {
  New = 'new',
  Contacted = 'contacted',
  Interested = 'interested',
  Closed = 'closed',
}

@Schema({ timestamps: true })
export class PropertyLead {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  propertyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  viewerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  landlordId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [] })
  agentIds: Types.ObjectId[];

  @Prop({ enum: PropertyLeadType, default: PropertyLeadType.View })
  type: PropertyLeadType;

  @Prop({ enum: PropertyLeadStatus, default: PropertyLeadStatus.New, index: true })
  status: PropertyLeadStatus;

  @Prop({ trim: true })
  viewerName?: string;

  @Prop({ trim: true })
  viewerEmail?: string;
}

export type PropertyLeadDocument = HydratedDocument<PropertyLead>;
export const PropertyLeadSchema = SchemaFactory.createForClass(PropertyLead);

PropertyLeadSchema.index({ propertyId: 1, createdAt: -1 });
PropertyLeadSchema.index({ agentIds: 1, status: 1, createdAt: -1 });
