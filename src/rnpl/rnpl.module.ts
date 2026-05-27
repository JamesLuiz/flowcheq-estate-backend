import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RnplApplication, RnplApplicationSchema } from './schemas/rnpl-application.schema';
import { RnplService } from './rnpl.service';
import { RnplController } from './rnpl.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RnplApplication.name, schema: RnplApplicationSchema },
    ]),
  ],
  providers: [RnplService],
  controllers: [RnplController],
  exports: [RnplService],
})
export class RnplModule {}
