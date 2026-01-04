import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { FlutterwaveService } from './flutterwave.service';
import { Promotion, PromotionSchema } from './schemas/promotion.schema';
import { HousesModule } from '../houses/houses.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Promotion.name, schema: PromotionSchema },
    ]),
    forwardRef(() => HousesModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService, FlutterwaveService],
  exports: [PromotionsService, FlutterwaveService],
})
export class PromotionsModule {}

