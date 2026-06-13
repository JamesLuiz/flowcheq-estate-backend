import { Module, forwardRef } from '@nestjs/common';
import { YouverifyService } from './youverify.service';
import { YouverifyController } from './youverify.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [YouverifyController],
  providers: [YouverifyService],
  exports: [YouverifyService],
})
export class YouverifyModule {}
