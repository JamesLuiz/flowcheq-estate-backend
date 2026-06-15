import { Module, forwardRef } from '@nestjs/common';
import { YouverifyService } from './youverify.service';
import { YouverifyController } from './youverify.controller';
import { UsersModule } from '../users/users.module';
import { HousesModule } from '../houses/houses.module';

@Module({
  imports: [forwardRef(() => UsersModule), forwardRef(() => HousesModule)],
  controllers: [YouverifyController],
  providers: [YouverifyService],
  exports: [YouverifyService],
})
export class YouverifyModule {}
