import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { LandlordsService } from './landlords.service';

@Controller('landlords')
@ApiTags('Landlords')
export class LandlordsController {
  constructor(private readonly landlordsService: LandlordsService) {}

  private ensureLandlord(user: RequestUser) {
    if (user.role !== 'landlord' && user.role !== 'real_estate_company') {
      throw new ForbiddenException('Landlord access required');
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get own landlord profile' })
  @ApiResponse({ status: 200, description: 'Landlord profile returned' })
  getProfile(@CurrentUser() user: RequestUser) {
    this.ensureLandlord(user);
    return this.landlordsService.getProfile(user.sub);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update landlord profile' })
  @ApiResponse({ status: 200, description: 'Landlord profile updated' })
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    this.ensureLandlord(user);
    return this.landlordsService.updateProfile(user.sub, body);
  }

  @Post('kyc/individual')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Submit individual landlord KYC documents' })
  submitIndividualKyc(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    this.ensureLandlord(user);
    return this.landlordsService.submitIndividualKyc(user.sub, body);
  }

  @Post('kyc/company')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Submit company landlord KYC documents' })
  submitCompanyKyc(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    this.ensureLandlord(user);
    return this.landlordsService.submitCompanyKyc(user.sub, body);
  }

  @Get('kyc/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Check landlord KYC status' })
  getKycStatus(@CurrentUser() user: RequestUser) {
    this.ensureLandlord(user);
    return this.landlordsService.getKycStatus(user.sub);
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get landlord dashboard stats' })
  getDashboard(@CurrentUser() user: RequestUser) {
    this.ensureLandlord(user);
    return this.landlordsService.getDashboard(user.sub);
  }

  @Get('enquiries')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all enquiries for landlord listings' })
  getEnquiries(@CurrentUser() user: RequestUser) {
    this.ensureLandlord(user);
    return this.landlordsService.getEnquiries(user.sub);
  }

  @Post('bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Set bank account for payouts' })
  setBankAccount(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      bankName: string;
      accountNumber: string;
      accountName: string;
      bankCode: string;
    },
  ) {
    this.ensureLandlord(user);
    return this.landlordsService.setBankAccount(user.sub, body);
  }

  @Get('bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get configured landlord bank account' })
  async getBankAccount(@CurrentUser() user: RequestUser) {
    this.ensureLandlord(user);
    const profile = await this.landlordsService.getProfile(user.sub);
    return { bankAccount: (profile as any).bankAccount ?? null };
  }

  @Get(':id/public')
  @ApiOperation({ summary: 'Get public landlord profile' })
  getPublicProfile(@Param('id') id: string) {
    return this.landlordsService.getPublicProfile(id);
  }

  @Get(':id/listings')
  @ApiOperation({ summary: 'Get all active listings by landlord' })
  getPublicListings(@Param('id') id: string) {
    return this.landlordsService.getPublicListings(id);
  }
}
