import { Module } from '@nestjs/common';
import { AuthModule } from '../../../src/auth/auth.module';
import { UsersModule } from '../../../src/users/users.module';
import { LandlordsModule } from '../../../src/landlords/landlords.module';

@Module({
  imports: [AuthModule, UsersModule, LandlordsModule],
})
export class AuthServiceAppModule {}
