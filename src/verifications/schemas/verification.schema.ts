import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export enum DocumentType {
  NIN = 'nin',
  DRIVER_LICENSE = 'driver_license',
}

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({
  timestamps: true,
})
export class Verification {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: DocumentType,
    required: true,
  })
  documentType: DocumentType;

  @Prop({ required: true, trim: true })
  documentUrl: string; // Cloudinary URL

  @Prop({ required: true, trim: true })
  cloudinaryPublicId: string; // For deletion

  @Prop({ required: true, trim: true })
  selfieUrl: string; // Selfie/Passport photo Cloudinary URL

  @Prop({ required: true, trim: true })
  selfiePublicId: string; // For deletion

  @Prop({
    type: String,
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
    index: true,
  })
  status: VerificationStatus;

  @Prop({ trim: true })
  rejectionReason?: string;

  @Prop({ trim: true })
  adminMessage?: string; // Message from admin to user

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
  })
  reviewedBy?: Types.ObjectId; // Admin who reviewed

  @Prop({ default: false })
  nameMatches: boolean; // Whether name on document matches user's name

  @Prop({ trim: true })
  documentName?: string; // Name extracted from document (for comparison)

  // Timestamps added by Mongoose when `timestamps: true` is set on the schema.
  // Declared here so TypeScript recognizes them on document instances.
  createdAt?: Date;
  updatedAt?: Date;
}

export type VerificationDocument = HydratedDocument<Verification>;
export const VerificationSchema = SchemaFactory.createForClass(Verification);

VerificationSchema.index({ userId: 1, status: 1 });
VerificationSchema.index({ status: 1, createdAt: -1 });

