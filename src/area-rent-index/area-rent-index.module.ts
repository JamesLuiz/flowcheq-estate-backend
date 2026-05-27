import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AreaRentIndexSnapshot, AreaRentIndexSnapshotSchema } from './schemas/area-rent-index.schema';
import { AreaRentIndexService } from './area-rent-index.service';
import { AreaRentIndexController } from './area-rent-index.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AreaRentIndexSnapshot.name, schema: AreaRentIndexSnapshotSchema },
    ]),
  ],
  providers: [AreaRentIndexService],
  controllers: [AreaRentIndexController],
  exports: [AreaRentIndexService],
})
export class AreaRentIndexModule {}
