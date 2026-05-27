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

  @Prop({ min: 0 })
  annualRent?: number;

  @Prop({ required: true, trim: true })
  location: string;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({
    type: String,
    enum: ['flat', 'self_con', 'duplex', 'bungalow', 'room_parlour', 'studio', 'detached', 'semi_detached', 'terraced'],
    default: 'flat',
  })
  propertyType?: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  // Tagged photos with room types and descriptions
  @Prop({
    type: [
      {
        url: { type: String, required: true },
        tag: { type: String, required: true },
        description: { type: String },
        lat: { type: Number },
        lng: { type: Number },
        accuracy: { type: Number },
        capturedAt: { type: Date },
        gpsVerified: { type: Boolean, default: false },
        _id: false,
      },
    ],
    default: [],
  })
  taggedPhotos?: Array<{
    url: string;
    tag: string;
    description?: string;
    lat?: number;
    lng?: number;
    accuracy?: number;
    capturedAt?: Date;
    gpsVerified?: boolean;
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

  // Proof of address (legacy single doc — prefer ownershipDocuments)
  @Prop({ type: String })
  proofOfAddress?: string;

  @Prop({
    type: [
      {
        type: {
          type: String,
          enum: ['c_of_o', 'utility_bill', 'deed', 'governors_consent', 'land_survey'],
          required: true,
        },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    default: [],
  })
  ownershipDocuments?: Array<{
    type: 'c_of_o' | 'utility_bill' | 'deed' | 'governors_consent' | 'land_survey';
    url: string;
    uploadedAt?: Date;
  }>;

  @Prop({ type: Number, default: 5000 })
  inspectionFeeAmount?: number;

  @Prop({ default: false })
  inspectionFeePaid?: boolean;

  @Prop()
  inspectionPaymentRef?: string;

  @Prop()
  inspectionPaidAt?: Date;

  // Address verification status (set by admin)
  @Prop({ default: false, index: true })
  addressVerified?: boolean;

  @Prop({
    type: String,
    enum: ['draft', 'pending_verification', 'verified', 'rejected', 'expired'],
    default: 'pending_verification',
    index: true,
  })
  verificationStatus?: string;

  @Prop({
    type: String,
    enum: ['active', 'rented', 'paused', 'archived'],
    default: 'active',
    index: true,
  })
  status?: string;

  @Prop()
  archivedAt?: Date;

  @Prop({ default: false })
  enquiryEnabled?: boolean;

  @Prop({ type: [String], default: [] })
  enquiredByUsers?: string[];

  /** Normalized amenity slugs (e.g. wifi, parking, pool) — use lowercase for consistent filtering */
  @Prop({ type: [String], default: [] })
  amenities?: string[];

  @Prop({ default: false })
  gpsVerifiedPhotos?: boolean;

  @Prop({ default: false })
  coordinatesVerifiedOnSite?: boolean;

  @Prop({
    type: {
      lat: { type: Number },
      lng: { type: Number },
      accuracy: { type: Number },
      verifiedBy: { type: Types.ObjectId, ref: 'User' },
      verifiedAt: { type: Date },
      distanceMeters: { type: Number },
      notes: { type: String },
    },
    _id: false,
  })
  agentLocationVerification?: {
    lat: number;
    lng: number;
    accuracy: number;
    verifiedBy: Types.ObjectId;
    verifiedAt: Date;
    distanceMeters: number;
    notes?: string;
  };

  @Prop({ type: Object })
  photoLocationVerification?: Record<string, unknown>;
}

export type HouseDocument = HydratedDocument<House>;
export const HouseSchema = SchemaFactory.createForClass(House);

HouseSchema.index(
  { price: 1, location: 1, type: 1 },
  { name: 'house_search_index' },
);

