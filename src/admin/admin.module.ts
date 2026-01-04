import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { AuthModule } from '../auth/auth.module';
import { ViewingsModule } from '../viewings/viewings.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => PromotionsModule),
    forwardRef(() => AuthModule),
    ViewingsModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
