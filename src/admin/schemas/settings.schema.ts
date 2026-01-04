import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Settings {
  @Prop({ required: true, unique: true, default: 'platform' })
  key: string;

  @Prop({ type: Object, required: true })
  value: any;

  @Prop()
  description?: string;
}

export type SettingsDocument = HydratedDocument<Settings>;
export const SettingsSchema = SchemaFactory.createForClass(Settings);

