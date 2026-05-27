import { Module } from '@nestjs/common';
import { HousesModule } from '../../../src/houses/houses.module';
import { VerificationsModule } from '../../../src/verifications/verifications.module';
import { PropertiesModule } from '../../../src/properties/properties.module';
import { FieldVerifiersModule } from '../../../src/field-verifiers/field-verifiers.module';
import { VerificationModule } from '../../../src/verification/verification.module';
@Module({
  imports: [
    HousesModule,
    VerificationsModule,
    PropertiesModule,
    FieldVerifiersModule,
    VerificationModule,
  ],
})
export class PropertyServiceAppModule {}
