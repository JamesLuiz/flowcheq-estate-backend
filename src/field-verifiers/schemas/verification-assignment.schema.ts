import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class VerificationAssignment {
  @Prop({ required: true, index: true })
  propertyId: string;

  @Prop({ required: true, index: true })
  fieldVerifierId: string;

  @Prop({
    type: String,
    enum: ['assigned', 'in_progress', 'completed', 'failed', 'reassigned'],
    default: 'assigned',
    index: true,
  })
  status: string;

  @Prop({ type: Date })
  scheduledVisitDate?: Date;

  @Prop({ type: Object })
  checkInCoordinates?: { lat: number; lng: number } | null;

  @Prop({ type: Number })
  checkInDistanceFromProperty?: number | null;

  @Prop({ type: Date })
  checkInTime?: Date | null;

  @Prop({ type: [String], default: [] })
  photos?: string[];

  @Prop()
  verifierNotes?: string;

  @Prop({ type: Object })
  conditionReport?: Record<string, unknown>;

  @Prop({ type: Date })
  completedAt?: Date | null;

  @Prop({ type: Number, default: 0 })
  payoutAmount?: number;

  @Prop({
    type: String,
    enum: ['pending', 'processing', 'paid'],
    default: 'pending',
  })
  payoutStatus?: string;

  @Prop()
  payoutReference?: string;
}

export type VerificationAssignmentDocument = HydratedDocument<VerificationAssignment>;
export const VerificationAssignmentSchema = SchemaFactory.createForClass(VerificationAssignment);
