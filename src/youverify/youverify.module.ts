import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { YouverifyService } from './youverify.service';
import { YouverifyController } from './youverify.controller';
import { VerificationPaymentsService } from './verification-payments.service';
import {
  VerificationPayment,
  VerificationPaymentSchema,
} from './schemas/verification-payment.schema';
import { UsersModule } from '../users/users.module';
import { HousesModule } from '../houses/houses.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VerificationPayment.name, schema: VerificationPaymentSchema },
    ]),
    forwardRef(() => UsersModule),
    forwardRef(() => HousesModule),
    forwardRef(() => PromotionsModule),
  ],
  controllers: [YouverifyController],
  providers: [YouverifyService, VerificationPaymentsService],
  exports: [YouverifyService, VerificationPaymentsService],
})
export class YouverifyModule {}
