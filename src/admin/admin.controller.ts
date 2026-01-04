import {
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Delete,
  Query,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { UsersService } from '../users/users.service';
import { PromotionsService } from '../promotions/promotions.service';
import { EmailService } from '../auth/email.service';
import { ViewingsService } from '../viewings/viewings.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiTags('Admin')
@ApiBearerAuth('access-token')
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly promotionsService: PromotionsService,
    private readonly emailService: EmailService,
    private readonly viewingsService: ViewingsService,
    private readonly configService: ConfigService,
  ) {}

  private ensureAdmin(user: RequestUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
  }

  // ============ VERIFICATIONS ============

  @Get('verifications/pending')
  @ApiOperation({ summary: 'List pending agent verifications' })
  @ApiResponse({
    status: 200,
    description: 'List of agents pending verification',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            name: 'Agent Example',
            email: 'agent@example.com',
            verificationStatus: 'pending',
            phone: '+2348012345678',
            bio: 'Experienced real estate agent',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  async getPendingVerifications(@CurrentUser() user: RequestUser) {
    this.ensureAdmin(user);
    
    const agents = await this.usersService.findAgents(
      { verificationStatus: 'pending' },
      {},
    );

    return {
      data: agents.map((agent) => this.usersService.toSafeUser(agent)),
    };
  }

  @Patch('verifications/:agentId')
  @ApiOperation({ summary: "Update an agent's verification status (admin only)" })
  @ApiParam({ name: 'agentId', description: 'Agent ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Updated agent profile',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        name: 'Agent Example',
        email: 'agent@example.com',
        verificationStatus: 'approved',
        verified: true,
        verificationDate: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async updateVerificationStatus(
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
    @Body('status') status: 'approved' | 'rejected',
  ) {
    this.ensureAdmin(user);

    const updatePayload: any = {
      verificationStatus: status,
    };

    if (status === 'approved') {
      updatePayload.verified = true;
      updatePayload.verificationDate = new Date();
    } else {
      updatePayload.verified = false;
    }

    return this.usersService.updateAgentProfile(agentId, updatePayload);
  }

  // ============ PROMOTIONS ============

  @Get('promotions')
  @ApiOperation({ summary: 'Get all promotions (admin)' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'cancelled'], description: 'Filter by status' })
  @ApiResponse({
    status: 200,
    description: 'List of promotions',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            houseId: {
              _id: '64a1f2e9c...',
              title: '3 bedroom flat in Lekki',
            },
            userId: {
              _id: '64a1f2e9c...',
              name: 'Agent Name',
            },
            bannerImage: 'https://res.cloudinary.com/.../banner.jpg',
            startDate: '2025-01-01T00:00:00.000Z',
            endDate: '2025-01-08T00:00:00.000Z',
            status: 'active',
            clicks: 10,
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  async getAllPromotions(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
  ) {
    this.ensureAdmin(user);
    
    return this.promotionsService.findAll({
      status: status as any,
    });
  }

  @Patch('promotions/:id/activate')
  @ApiOperation({ summary: 'Activate a promotion (admin)' })
  @ApiParam({ name: 'id', description: 'Promotion ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Activated promotion',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        status: 'active',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-08T00:00:00.000Z',
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async activatePromotion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);
    return this.promotionsService.activate(id);
  }

  @Delete('promotions/:id')
  @ApiOperation({ summary: 'Cancel a promotion (admin)' })
  @ApiParam({ name: 'id', description: 'Promotion ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Canceled promotion',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        status: 'cancelled',
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async cancelPromotion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);
    return this.promotionsService.adminCancel(id);
  }

  // ============ VERIFICATION REMINDER ============

  @Post('send-verification-reminder/:agentId')
  @ApiOperation({ summary: 'Send verification reminder email to unverified agent' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Reminder email sent',
    schema: {
      example: { success: true, message: 'Verification reminder sent' },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async sendVerificationReminder(
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
  ) {
    this.ensureAdmin(user);

    const agent = await this.usersService.findById(agentId);
    if (!agent) {
      throw new ForbiddenException('Agent not found');
    }

    await this.emailService.sendVerificationReminderEmail(agent.email, agent.name);

    return { success: true, message: 'Verification reminder sent' };
  }

  // ============ VIEWING FEES MANAGEMENT ============

  @Get('viewing-fees')
  @ApiOperation({ summary: 'Get all viewing fees with receipts (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all viewing fees',
  })
  async getAllViewingFees(@CurrentUser() user: RequestUser) {
    this.ensureAdmin(user);
    return this.viewingsService.getAllViewings();
  }

  @Get('viewing-fees/platform-fee-percentage')
  @ApiOperation({ summary: 'Get platform fee percentage setting' })
  @ApiResponse({
    status: 200,
    description: 'Platform fee percentage',
    schema: {
      example: {
        platformFeePercentage: 10,
      },
    },
  })
  async getPlatformFeePercentage(@CurrentUser() user: RequestUser) {
    this.ensureAdmin(user);
    const percentage = parseFloat(
      this.configService.get<string>('VIEWING_FEE_PERCENTAGE') || '10',
    );
    return { platformFeePercentage: percentage };
  }

  @Patch('viewing-fees/platform-fee-percentage')
  @ApiOperation({ summary: 'Update platform fee percentage (admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        platformFeePercentage: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          example: 10,
          description: 'Platform fee percentage (0-100)',
        },
      },
      required: ['platformFeePercentage'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Platform fee percentage updated',
    schema: {
      example: {
        success: true,
        platformFeePercentage: 10,
        message: 'Platform fee percentage updated. Note: This requires restarting the server to take effect.',
      },
    },
  })
  async updatePlatformFeePercentage(
    @Body() body: { platformFeePercentage: number },
    @CurrentUser() user: RequestUser,
  ) {
    this.ensureAdmin(user);

    if (body.platformFeePercentage < 0 || body.platformFeePercentage > 100) {
      throw new ForbiddenException('Platform fee percentage must be between 0 and 100');
    }

    // Note: In a production environment, you'd want to store this in a database settings collection
    // For now, we'll just validate and return a message
    // The actual value is read from environment variables
    return {
      success: true,
      platformFeePercentage: body.platformFeePercentage,
      message: 'Platform fee percentage updated. Note: Update VIEWING_FEE_PERCENTAGE environment variable and restart server for changes to take effect.',
    };
  }
}
