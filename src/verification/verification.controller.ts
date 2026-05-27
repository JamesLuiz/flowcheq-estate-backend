import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { FieldVerifiersService } from '../field-verifiers/field-verifiers.service';
import { PropertiesService } from '../properties/properties.service';
import { PropertyInspectionService } from './property-inspection.service';
import { House, HouseDocument } from '../houses/schemas/house.schema';
import { UsersService } from '../users/users.service';
import { INSPECTION_FEE_NGN } from '../common/listing-requirements';

@Controller('verification')
@ApiTags('Verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class VerificationController {
  constructor(
    private readonly fieldVerifiersService: FieldVerifiersService,
    private readonly propertiesService: PropertiesService,
    private readonly inspectionService: PropertyInspectionService,
    private readonly usersService: UsersService,
    @InjectModel(House.name) private readonly houseModel: Model<HouseDocument>,
  ) {}

  @Post('inspection/pay')
  @Roles('landlord', 'real_estate_company', 'company')
  @ApiOperation({ summary: `Pay ₦${INSPECTION_FEE_NGN} property inspection fee (Flutterwave)` })
  async payInspection(
    @CurrentUser() user: RequestUser,
    @Body() body: { propertyId: string },
  ) {
    const profile = await this.usersService.findById(user.sub);
    return this.inspectionService.initializeInspectionPaymentForUser(
      body.propertyId,
      user.sub,
      profile?.email ?? user.email,
      profile?.name ?? 'Landlord',
    );
  }

  @Post('inspection/confirm')
  @Roles('landlord', 'real_estate_company', 'company')
  @ApiOperation({ summary: 'Confirm inspection fee payment after Flutterwave redirect' })
  async confirmInspection(
    @CurrentUser() user: RequestUser,
    @Body() body: { propertyId: string; transactionId: string },
  ) {
    const house = await this.houseModel.findById(body.propertyId).lean();
    if (!house || house.agentId?.toString() !== user.sub) {
      throw new NotFoundException('Property not found');
    }
    return this.inspectionService.confirmInspectionPayment(
      body.propertyId,
      body.transactionId,
    );
  }

  @Get('inspection/fee')
  @ApiOperation({ summary: 'Inspection fee amount (NGN)' })
  getInspectionFee() {
    return { amount: INSPECTION_FEE_NGN, currency: 'NGN', label: 'Property inspection fee' };
  }

  @Post('request')
  @Roles('landlord', 'real_estate_company', 'company')
  @ApiOperation({ summary: 'Submit property for field inspection (requires ₦5k fee paid)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { propertyId: { type: 'string' } },
      required: ['propertyId'],
    },
  })
  async request(@CurrentUser() user: RequestUser, @Body() body: { propertyId: string }) {
    const house = await this.houseModel.findById(body.propertyId).exec();
    if (!house || house.agentId.toString() !== user.sub) {
      throw new ForbiddenException('You can only request inspection for your own listings');
    }
    await this.inspectionService.assertInspectionPaid(body.propertyId);
    await this.houseModel.findByIdAndUpdate(body.propertyId, {
      $set: { verificationStatus: 'pending_verification' },
    });
    return {
      success: true,
      propertyId: body.propertyId,
      status: 'pending_verification',
      inspectionFeePaid: true,
    };
  }

  @Get('queue')
  @Roles('admin')
  @ApiOperation({ summary: 'Pending verification requests (admin)' })
  async queue() {
    const data = await this.houseModel
      .find({ verificationStatus: 'pending_verification', deleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .lean();
    return { data };
  }

  @Post(':id/assign')
  @Roles('admin')
  assign(
    @Param('id') id: string,
    @Body() body: { fieldVerifierId: string; scheduledVisitDate?: string },
  ) {
    return this.fieldVerifiersService.createAssignment({
      propertyId: id,
      fieldVerifierId: body.fieldVerifierId,
      scheduledVisitDate: body.scheduledVisitDate ? new Date(body.scheduledVisitDate) : undefined,
    });
  }

  @Post(':id/reassign')
  @Roles('admin')
  reassign(
    @Param('id') id: string,
    @Body() body: { fieldVerifierId: string; scheduledVisitDate?: string },
  ) {
    return this.fieldVerifiersService.createAssignment({
      propertyId: id,
      fieldVerifierId: body.fieldVerifierId,
      scheduledVisitDate: body.scheduledVisitDate ? new Date(body.scheduledVisitDate) : undefined,
    });
  }

  @Post(':id/approve')
  @Roles('admin')
  async approve(
    @Param('id') id: string,
    @Body() body: { landlordId: string },
  ) {
    await this.propertiesService.activate(id, body.landlordId);
    await this.houseModel.findByIdAndUpdate(id, {
      $set: { verificationStatus: 'verified', status: 'active' },
    });
    return { success: true, status: 'verified' };
  }

  @Post(':id/reject')
  @Roles('admin')
  async reject(@Param('id') id: string, @Body() body: { reason: string }) {
    await this.houseModel.findByIdAndUpdate(id, {
      $set: { verificationStatus: 'rejected', status: 'paused' },
    });
    return { success: true, id, status: 'rejected', reason: body.reason };
  }

  @Get(':propertyId/status')
  @Roles('landlord', 'real_estate_company', 'company')
  async status(@Param('propertyId') propertyId: string) {
    const property = await this.propertiesService.findOne(propertyId);
    const house = await this.houseModel.findById(propertyId).select('inspectionFeePaid inspectionFeeAmount').lean();
    return {
      status: (property as any).verificationStatus ?? 'pending_verification',
      inspectionFeePaid: house?.inspectionFeePaid ?? false,
      inspectionFeeAmount: house?.inspectionFeeAmount ?? INSPECTION_FEE_NGN,
    };
  }

  @Get(':id/report')
  @Roles('admin')
  async report(@Param('id') id: string) {
    const report = await this.fieldVerifiersService.getLatestAssignmentForProperty(id);
    return { id, report };
  }
}
