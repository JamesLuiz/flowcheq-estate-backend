import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { House, HouseSchema } from '../houses/schemas/house.schema';
import { HousesModule } from '../houses/houses.module';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';

@Module({
  imports: [
    HousesModule,
    MongooseModule.forFeature([{ name: House.name, schema: HouseSchema }]),
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
