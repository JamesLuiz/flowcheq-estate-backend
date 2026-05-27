import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@ApiTags('Subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Available subscription plans and pricing' })
  @ApiResponse({ status: 200, description: 'Plans returned' })
  plans() {
    return this.subscriptionsService.plans();
  }

  @Get('current')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Current active subscription details' })
  current(@CurrentUser() user: RequestUser) {
    return this.subscriptionsService.current(user.sub);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Initiate subscription payment' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tier: { type: 'string', enum: ['free', 'basic', 'pro'], example: 'basic' },
        billingCycle: { type: 'string', enum: ['monthly', 'annual'], example: 'monthly' },
      },
      required: ['tier'],
    },
  })
  subscribe(
    @CurrentUser() user: RequestUser,
    @Body() body: { tier: 'free' | 'basic' | 'pro'; billingCycle?: 'monthly' | 'annual' },
  ) {
    return this.subscriptionsService.subscribe(user.sub, body);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Subscription payment webhook callback' })
  webhook(@Body() body: any) {
    return this.subscriptionsService.webhook(body);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel active subscription' })
  cancel(@CurrentUser() user: RequestUser, @Body() body: { reason?: string }) {
    return this.subscriptionsService.cancel(user.sub, body.reason);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Subscription billing history' })
  invoices(@CurrentUser() user: RequestUser) {
    return this.subscriptionsService.invoices(user.sub);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Admin subscription + MRR overview' })
  admin() {
    return this.subscriptionsService.adminOverview();
  }
}
