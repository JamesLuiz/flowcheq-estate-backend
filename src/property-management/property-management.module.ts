import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertyManagementService } from './property-management.service';
import { PropertyManagementController } from './property-management.controller';
import {
  ManagementRequest,
  ManagementRequestSchema,
} from './schemas/management-request.schema';
import {
  PropertyLead,
  PropertyLeadSchema,
} from './schemas/property-lead.schema';
import { House, HouseSchema } from '../houses/schemas/house.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ManagementRequest.name, schema: ManagementRequestSchema },
      { name: PropertyLead.name, schema: PropertyLeadSchema },
      { name: House.name, schema: HouseSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [PropertyManagementController],
  providers: [PropertyManagementService],
  exports: [PropertyManagementService],
})
export class PropertyManagementModule {}
