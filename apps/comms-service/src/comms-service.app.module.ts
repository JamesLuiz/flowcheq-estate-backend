import { Module } from '@nestjs/common';
import { MessagesModule } from '../../../src/messages/messages.module';
import { ViewingsModule } from '../../../src/viewings/viewings.module';
import { AlertsModule } from '../../../src/alerts/alerts.module';
import { ReviewsModule } from '../../../src/reviews/reviews.module';

@Module({
  imports: [MessagesModule, ViewingsModule, AlertsModule, ReviewsModule],
})
export class CommsServiceAppModule {}
