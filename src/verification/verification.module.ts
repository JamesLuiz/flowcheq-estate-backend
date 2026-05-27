import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VerificationController } from './verification.controller';
import { PropertyInspectionService } from './property-inspection.service';
import { FieldVerifiersModule } from '../field-verifiers/field-verifiers.module';
import { PropertiesModule } from '../properties/properties.module';
import { House, HouseSchema } from '../houses/schemas/house.schema';
import { PromotionsModule } from '../promotions/promotions.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    FieldVerifiersModule,
    PropertiesModule,
    UsersModule,
    forwardRef(() => PromotionsModule),
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([{ name: House.name, schema: HouseSchema }]),
  ],
  controllers: [VerificationController],
  providers: [PropertyInspectionService],
  exports: [PropertyInspectionService],
})
export class VerificationModule {}
