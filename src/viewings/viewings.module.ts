import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ViewingsController } from './viewings.controller';
import { ViewingsService } from './viewings.service';
import { Viewing, ViewingSchema } from './schemas/viewing.schema';
import { UsersModule } from '../users/users.module';
import { HousesModule } from '../houses/houses.module';
import { CloudinaryService } from '../houses/cloudinary.service';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Viewing.name, schema: ViewingSchema }]),
    UsersModule,
    HousesModule,
    forwardRef(() => PromotionsModule),
  ],
  controllers: [ViewingsController],
  providers: [ViewingsService, CloudinaryService],
  exports: [ViewingsService],
})
export class ViewingsModule {}
