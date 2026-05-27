import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class AreaRentIndexSnapshot {
  @Prop({ required: true, index: true })
  district: string;

  @Prop({ required: true, index: true })
  city: string;

  @Prop({ required: true, index: true })
  state: string;

  @Prop({ required: true, index: true })
  propertyType: string;

  @Prop({ required: true, index: true })
  bedrooms: number;

  @Prop({ required: true })
  p25Rent: number;

  @Prop({ required: true })
  medianRent: number;

  @Prop({ required: true })
  p75Rent: number;

  @Prop({ required: true })
  sampleSize: number;

  @Prop({ required: true, default: 0 })
  trendVs6Months: number;

  @Prop({ required: true })
  computedAt: Date;

  @Prop({ required: true, index: true })
  validUntil: Date;
}

export type AreaRentIndexSnapshotDocument = HydratedDocument<AreaRentIndexSnapshot>;
export const AreaRentIndexSnapshotSchema = SchemaFactory.createForClass(AreaRentIndexSnapshot);
