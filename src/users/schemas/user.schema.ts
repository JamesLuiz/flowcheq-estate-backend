import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum UserRole {
  Agent = 'agent',
  Landlord = 'landlord',
  User = 'user',
  Admin = 'admin',
  Company = 'company', // Real Estate Company
}

@Schema({
  timestamps: true,
})
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({
    required: true,
    enum: UserRole,
    default: UserRole.User,
  })
  role: UserRole;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  bio?: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ select: false })
  resetToken?: string;

  @Prop({ select: false })
  resetTokenExpiry?: Date;

  @Prop({ default: false })
  verified?: boolean;

  @Prop()
  verificationStatus?: string; // 'pending' | 'approved' | 'rejected'

  @Prop()
  verificationDate?: Date;

  // Bank Account Details for Flutterwave
  @Prop({ type: Object })
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    bankCode: string;
  };

  // Wallet/Earnings balance
  @Prop({ type: Number, default: 0 })
  walletBalance?: number;

  // Transaction PIN for withdrawals (hashed)
  @Prop({ select: false })
  transactionPin?: string;

  // Transaction PIN reset
  @Prop({ select: false })
  transactionPinResetCode?: string;

  @Prop({ select: false })
  transactionPinResetExpiry?: Date;

  @Prop({ type: Number, default: 0 })
  transactionPinAttempts?: number; // Track failed PIN attempts

  @Prop()
  transactionPinLockedUntil?: Date; // Lock PIN after too many attempts

  // Withdrawal OTP
  @Prop({ select: false })
  withdrawalOtp?: string;

  @Prop({ select: false })
  withdrawalOtpExpiry?: Date;

  // Account status fields
  @Prop({ default: 'active', enum: ['active', 'suspended', 'banned'], index: true })
  accountStatus?: 'active' | 'suspended' | 'banned';

  @Prop()
  suspendedUntil?: Date;

  @Prop()
  suspensionReason?: string;

  // Real Estate Company specific fields
  @Prop({ type: Object })
  companyDetails?: {
    companyName: string;
    cacNumber: string; // CAC Registration Number
    cacDocumentUrl?: string; // URL to uploaded CAC certificate
    businessEmail: string;
    businessPhone: string;
    address: string;
    city: string;
    state: string;
    website?: string;
    yearEstablished?: number;
    companySize?: string; // e.g., '1-10', '11-50', '51-200', '200+'
  };

  @Prop({ default: false })
  companyVerified?: boolean; // Separate verification for company documents

  @Prop()
  companyVerificationStatus?: 'pending' | 'approved' | 'rejected';

  @Prop()
  companyRejectionReason?: string;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });

