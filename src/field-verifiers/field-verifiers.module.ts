import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { VerificationAssignment, VerificationAssignmentSchema } from './schemas/verification-assignment.schema';
import { FieldVerifiersService } from './field-verifiers.service';
import { FieldVerifiersController } from './field-verifiers.controller';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: VerificationAssignment.name, schema: VerificationAssignmentSchema },
    ]),
  ],
  providers: [FieldVerifiersService],
  controllers: [FieldVerifiersController],
  exports: [FieldVerifiersService, MongooseModule],
})
export class FieldVerifiersModule {}
