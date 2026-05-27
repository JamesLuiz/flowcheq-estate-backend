import { Module } from '@nestjs/common';
import { PromotionsModule } from '../../../src/promotions/promotions.module';
import { RnplModule } from '../../../src/rnpl/rnpl.module';
import { SubscriptionsModule } from '../../../src/subscriptions/subscriptions.module';

@Module({
  imports: [PromotionsModule, RnplModule, SubscriptionsModule],
})
export class FinancialServiceAppModule {}
