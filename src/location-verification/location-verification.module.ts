import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { House, HouseSchema } from '../houses/schemas/house.schema';
import { GoogleMapsService } from '../google-maps/google-maps.service';
import { PhotoLocationVerificationService } from './photo-location-verification.service';
import { LocationVerificationController } from './location-verification.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: House.name, schema: HouseSchema }]),
  ],
  controllers: [LocationVerificationController],
  providers: [GoogleMapsService, PhotoLocationVerificationService],
  exports: [GoogleMapsService, PhotoLocationVerificationService],
})
export class LocationVerificationModule {}
