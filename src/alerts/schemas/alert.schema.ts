import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { House } from '../../houses/schemas/house.schema';
import { User } from '../../users/schemas/user.schema';

export class AlertMatch {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: House.name,
  })
  houseId: Types.ObjectId;

  @Prop({ type: Date })
  matchedAt: Date;
}

@Schema({
  timestamps: true,
})
export class Alert {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ type: Number, min: 0 })
  minPrice?: number;

  @Prop({ type: Number, min: 0 })
  maxPrice?: number;

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  type?: string;

  @Prop({
    type: {
      lat: { type: Number },
      lng: { type: Number },
    },
    _id: false,
  })
  coordinates?: { lat: number; lng: number };

  @Prop({ type: Number, default: 20 })
  radius?: number; // in kilometers

  @Prop({
    type: [
      {
        houseId: {
          type: MongooseSchema.Types.ObjectId,
          ref: House.name,
          required: true,
        },
        matchedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  matches: AlertMatch[];

  @Prop({ type: Date })
  lastNotifiedAt?: Date;
}

export type AlertDocument = HydratedDocument<Alert>;
export const AlertSchema = SchemaFactory.createForClass(Alert);

AlertSchema.index(
  { minPrice: 1, maxPrice: 1, location: 1, type: 1 },
  { name: 'alert_search_index' },
);

