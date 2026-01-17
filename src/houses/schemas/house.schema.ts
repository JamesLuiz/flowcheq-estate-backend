import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type Coordinates = {
  lat: number;
  lng: number;
};

@Schema({
  timestamps: true,
})
export class House {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, trim: true })
  location: string;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  // Tagged photos with room types and descriptions
  @Prop({
    type: [
      {
        url: { type: String, required: true },
        tag: { type: String, required: true }, // e.g., 'bathroom', 'bedroom', 'kitchen', 'sitting-room', 'lobby', 'toilet', 'full-photo'
        description: { type: String },
        _id: false,
      },
    ],
    default: [],
  })
  taggedPhotos?: Array<{
    url: string;
    tag: string;
    description?: string;
  }>;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  agentId: Types.ObjectId;

  @Prop({
    type: {
      lat: { type: Number },
      lng: { type: Number },
    },
    _id: false,
  })
  coordinates?: Coordinates;

  @Prop({ type: Number, min: 0 })
  bedrooms?: number;

  @Prop({ type: Number, min: 0 })
  bathrooms?: number;

  @Prop({ type: Number, min: 0 })
  area?: number;

  @Prop({ default: false })
  featured?: boolean;

  @Prop({ default: 0 })
  viewCount?: number;

  @Prop({ default: 0 })
  whatsappClicks?: number;

  @Prop({ default: false })
  deleted?: boolean;

  @Prop({ default: false, index: true })
  flagged?: boolean;

  @Prop()
  flaggedReason?: string;

  @Prop()
  flaggedAt?: Date;

  // Shared Property (2-to-Tango) fields
  @Prop({ default: false })
  isShared?: boolean;

  @Prop({ type: Number, min: 1, max: 10 })
  totalSlots?: number;

  @Prop({ type: Number, min: 0 })
  availableSlots?: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  bookedByUsers?: Types.ObjectId[];

  // Viewing/Tour fee in Naira
  @Prop({ type: Number, min: 0, default: 0 })
  viewingFee?: number;

  // Listing type: 'rent' or 'buy'
  @Prop({ type: String, enum: ['rent', 'buy'], default: 'buy', index: true })
  listingType?: 'rent' | 'buy';

  // Airbnb listing
  @Prop({ default: false })
  isAirbnb?: boolean;

  // Proof of address (utility bill or C of O)
  @Prop({ type: String })
  proofOfAddress?: string; // URL to uploaded document

  // Address verification status (set by admin)
  @Prop({ default: false, index: true })
  addressVerified?: boolean;
}

export type HouseDocument = HydratedDocument<House>;
export const HouseSchema = SchemaFactory.createForClass(House);

HouseSchema.index(
  { price: 1, location: 1, type: 1 },
  { name: 'house_search_index' },
);

