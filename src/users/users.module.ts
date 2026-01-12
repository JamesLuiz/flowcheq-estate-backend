import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { Withdrawal, WithdrawalSchema } from './schemas/withdrawal.schema';
import { Earning, EarningSchema } from './schemas/earning.schema';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { HousesModule } from '../houses/houses.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: Earning.name, schema: EarningSchema },
      { name: Wallet.name, schema: WalletSchema },
    ]),
    forwardRef(() => HousesModule),
    forwardRef(() => PromotionsModule),
    forwardRef(() => AuthModule),
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
