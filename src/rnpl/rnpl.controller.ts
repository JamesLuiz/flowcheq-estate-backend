import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { RnplService } from './rnpl.service';

@Controller('rnpl')
@ApiTags('RNPL')
export class RnplController {
  constructor(private readonly rnplService: RnplService) {}

  @Post('check-eligibility')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Initiate Mono link and run eligibility check' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        propertyId: { type: 'string', example: '6812f08d5f8f6f8d8833d123' },
        landlordId: { type: 'string', example: '6812f08d5f8f6f8d8833d124' },
        annualRentAmount: { type: 'number', example: 18000000 },
        requestedLoanAmount: { type: 'number', example: 18000000 },
        monoAccountId: { type: 'string', example: 'mono_abc123' },
      },
      required: ['propertyId', 'landlordId', 'annualRentAmount', 'requestedLoanAmount', 'monoAccountId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Eligibility computed and application created' })
  checkEligibility(@CurrentUser() user: RequestUser, @Body() body: any) {
    return this.rnplService.checkEligibility(user.sub, body);
  }

  @Get('eligibility/:propertyId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get pre-computed eligibility for a property' })
  eligibility(@CurrentUser() user: RequestUser, @Param('propertyId') propertyId: string) {
    return this.rnplService.getEligibility(user.sub, propertyId);
  }

  @Post('apply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Submit RNPL application to bank partner' })
  apply(@CurrentUser() user: RequestUser, @Body() body: { applicationId: string }) {
    return this.rnplService.apply(user.sub, body.applicationId);
  }

  @Get('applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Own RNPL applications' })
  applications(@CurrentUser() user: RequestUser) {
    return this.rnplService.listMine(user.sub);
  }

  @Get('applications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Single RNPL application status' })
  application(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.rnplService.getMineById(user.sub, id);
  }

  @Post('webhook/bank-callback')
  @ApiOperation({ summary: 'Receive bank partner status updates' })
  bankCallback(@Body() body: any) {
    return this.rnplService.bankCallback(body);
  }

  @Get('admin/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'All RNPL applications (admin)' })
  adminApplications(@CurrentUser() user: RequestUser) {
    return this.rnplService.adminList();
  }

  @Get('admin/referral-fees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'RNPL referral fee tracker (admin)' })
  adminReferralFees(@CurrentUser() user: RequestUser) {
    return this.rnplService.referralFees();
  }
}
