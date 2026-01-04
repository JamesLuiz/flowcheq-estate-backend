import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { AuthModule } from '../auth/auth.module';
import { ViewingsModule } from '../viewings/viewings.module';
import { HousesModule } from '../houses/houses.module';
import { Settings, SettingsSchema } from './schemas/settings.schema';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => PromotionsModule),
    forwardRef(() => AuthModule),
    ViewingsModule,
    HousesModule,
    MongooseModule.forFeature([{ name: Settings.name, schema: SettingsSchema }]),
  ],
  controllers: [AdminController],
})
export class AdminModule {}
