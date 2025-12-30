import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';
import { Verification, VerificationSchema } from './schemas/verification.schema';
import { UsersModule } from '../users/users.module';
import { HousesModule } from '../houses/houses.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Verification.name, schema: VerificationSchema },
    ]),
    UsersModule,
    forwardRef(() => HousesModule),
    AuthModule,
  ],
  controllers: [VerificationsController],
  providers: [VerificationsService],
  exports: [VerificationsService],
})
export class VerificationsModule {}

