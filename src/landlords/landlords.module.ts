import { Module } from '@nestjs/common';
import { LandlordsController } from './landlords.controller';
import { LandlordsService } from './landlords.service';
import { UsersModule } from '../users/users.module';
import { HousesModule } from '../houses/houses.module';

@Module({
  imports: [UsersModule, HousesModule],
  controllers: [LandlordsController],
  providers: [LandlordsService],
  exports: [LandlordsService],
})
export class LandlordsModule {}
