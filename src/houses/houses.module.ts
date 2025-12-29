import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HousesService } from './houses.service';
import { HousesController } from './houses.controller';
import { House, HouseSchema } from './schemas/house.schema';
import { UsersModule } from '../users/users.module';
import { AlertsModule } from '../alerts/alerts.module';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: House.name, schema: HouseSchema }]),
    forwardRef(() => UsersModule),
    AlertsModule,
  ],
  providers: [HousesService, CloudinaryService],
  controllers: [HousesController],
  exports: [HousesService, CloudinaryService],
})
export class HousesModule {}
