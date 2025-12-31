import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => PromotionsModule),
  ],
  controllers: [AdminController],
})
export class AdminModule {}
