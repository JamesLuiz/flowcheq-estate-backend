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
import { HousesService } from '../houses/houses.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './schemas/settings.schema';

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
    private readonly housesService: HousesService,
    @InjectModel(Settings.name) private readonly settingsModel: Model<SettingsDocument>,
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

  @Patch('properties/:propertyId/verify-address')
  @ApiOperation({ summary: "Mark a property's address as verified (admin only)" })
  @ApiParam({ name: 'propertyId', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({ status: 200, description: 'Property address marked as verified' })
  async verifyPropertyAddress(@CurrentUser() user: RequestUser, @Param('propertyId') propertyId: string) {
    this.ensureAdmin(user);
    return this.housesService.verifyPropertyAddress(propertyId);
  }

  // ============ PENDING DISBURSEMENTS ============

  @Get('disbursements/pending')
  @ApiOperation({ summary: 'Get pending disbursements for agents without virtual accounts' })
  @ApiResponse({
    status: 200,
    description: 'List of agents with pending disbursements (no virtual account)',
  })
  async getPendingDisbursements(@CurrentUser() user: RequestUser) {
    this.ensureAdmin(user);
    return this.usersService.getPendingDisbursements();
  }

  @Post('disbursements/process/:agentId')
  @ApiOperation({ summary: 'Process manual disbursement to agent bank account' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', example: 10000, description: 'Amount to disburse' },
        reason: { type: 'string', example: 'Manual viewing fee disbursement' },
      },
      required: ['amount'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Disbursement processed',
  })
  async processDisbursement(
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
    @Body() body: { amount: number; reason?: string },
  ) {
    this.ensureAdmin(user);
    return this.usersService.processManualDisbursement(agentId, body.amount, body.reason);
  }

  @Post('disbursements/process-bulk')
  @ApiOperation({ summary: 'Process bulk disbursements to multiple agents' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        disbursements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agentId: { type: 'string' },
              amount: { type: 'number' },
            },
          },
        },
        reason: { type: 'string' },
      },
    },
  })
  async processBulkDisbursements(
    @CurrentUser() user: RequestUser,
    @Body() body: { disbursements: { agentId: string; amount: number }[]; reason?: string },
  ) {
    this.ensureAdmin(user);
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };
    
    for (const disbursement of body.disbursements) {
      try {
        await this.usersService.processManualDisbursement(
          disbursement.agentId,
          disbursement.amount,
          body.reason,
        );
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Agent ${disbursement.agentId}: ${error.message}`);
      }
    }
    
    return {
      message: `Processed ${results.success} disbursements. ${results.failed} failed.`,
      ...results,
    };
  }

  // ============ VIEWING FEES MANAGEMENT ============
  @ApiOperation({ summary: 'Get all viewing fees with receipts (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all viewing fees',
  })
  async getAllViewingFees(@CurrentUser() user: RequestUser) {
    this.ensureAdmin(user);
    return this.viewingsService.getAllViewings();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get admin dashboard stats (agents, revenue, promotions, viewings)' })
  @ApiResponse({ status: 200, description: 'Admin stats' })
  async getStats(@CurrentUser() user: RequestUser) {
    this.ensureAdmin(user);

    // Agents counts
    const allAgents = await this.usersService.findAgents({}, {});
    const totalAgents = allAgents.length;
    const verifiedAgents = (await this.usersService.findAgents({ verified: true }, {})).length;

    // Promotions revenue: include active and expired promotions (they were paid)
    const allPromotions = await this.promotionsService.findAll();
    const totalPromotionRevenue = allPromotions
      .filter((p: any) => p.status === 'active' || p.status === 'expired')
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    // Viewing platform revenue: sum platform share across paid viewings
    const allViewings = await this.viewingsService.getAllViewings();
    const totalViewingPlatformRevenue = allViewings
      .filter((v: any) => v.paymentStatus === 'paid' && typeof v.viewingFee === 'number' && typeof v.platformFee === 'number')
      .reduce((sum: number, v: any) => sum + ((v.viewingFee || 0) * (v.platformFee || 0) / 100), 0);

    const totalPlatformRevenue = totalPromotionRevenue + totalViewingPlatformRevenue;

    return {
      totalAgents,
      verifiedAgents,
      totalPromotionRevenue,
      totalViewingPlatformRevenue,
      totalPlatformRevenue,
    };
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
    
    // Try to get from database first
    const settings = await this.settingsModel.findOne({ key: 'platformFeePercentage' });
    if (settings && typeof settings.value === 'number') {
      return { platformFeePercentage: settings.value };
    }
    
    // Fallback to environment variable
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
    // Store in database
    await this.settingsModel.findOneAndUpdate(
      { key: 'platformFeePercentage' },
      { key: 'platformFeePercentage', value: body.platformFeePercentage, description: 'Platform fee percentage for viewing fees' },
      { upsert: true, new: true },
    );

    return {
      success: true,
      platformFeePercentage: body.platformFeePercentage,
      message: 'Platform fee percentage updated successfully.',
    };
  }

  // ============ UNVERIFIED AGENTS ============

  @Get('agents/unverified')
  @ApiOperation({ summary: 'Get all unverified agents' })
  @ApiResponse({
    status: 200,
    description: 'List of unverified agents',
  })
  async getUnverifiedAgents(@CurrentUser() user: RequestUser) {
    this.ensureAdmin(user);
    const agents = await this.usersService.findAgents(
      { 
        role: { $in: ['agent', 'landlord'] },
        verified: { $ne: true }, 
        verificationStatus: { $ne: 'approved' } 
      },
      {},
    );
    return {
      data: agents.map((agent) => this.usersService.toSafeUser(agent)),
    };
  }

  @Post('agents/unverified/bulk-email')
  @ApiOperation({ summary: 'Send bulk email to all unverified agents' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Custom message to include in email' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk email sent',
  })
  async sendBulkEmailToUnverifiedAgents(
    @CurrentUser() user: RequestUser,
    @Body() body: { message?: string },
  ) {
    this.ensureAdmin(user);
    const agents = await this.usersService.findAgents(
      { 
        role: { $in: ['agent', 'landlord'] },
        verified: { $ne: true }, 
        verificationStatus: { $ne: 'approved' } 
      },
      {},
    );

    let successCount = 0;
    let failCount = 0;

    for (const agent of agents) {
      try {
        await this.emailService.sendVerificationReminderEmail(
          agent.email,
          agent.name,
          body.message,
        );
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    return {
      success: true,
      message: `Bulk email sent to ${successCount} agents. ${failCount} failed.`,
      successCount,
      failCount,
      total: agents.length,
    };
  }

  // ============ AGENT MANAGEMENT ============

  @Get('agents')
  @ApiOperation({ summary: 'Get all agents (admin)' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'suspended', 'banned'] })
  @ApiResponse({
    status: 200,
    description: 'List of agents',
  })
  async getAllAgents(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
  ) {
    this.ensureAdmin(user);
    const filter: any = { role: { $in: ['agent', 'landlord'] } };
    if (status) {
      filter.accountStatus = status;
    }
    const agents = await this.usersService.findAgents(filter, {});
    return {
      data: agents.map((agent) => this.usersService.toSafeUser(agent)),
    };
  }

  @Patch('agents/:agentId/suspend')
  @ApiOperation({ summary: 'Suspend an agent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        suspendedUntil: { type: 'string', format: 'date-time' },
      },
    },
  })
  async suspendAgent(
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
    @Body() body: { reason?: string; suspendedUntil?: string },
  ) {
    this.ensureAdmin(user);
    const updateData: any = {
      accountStatus: 'suspended',
      suspensionReason: body.reason,
    };
    if (body.suspendedUntil) {
      updateData.suspendedUntil = new Date(body.suspendedUntil);
    }
    const agent = await this.usersService.updateAgentProfile(agentId, updateData);
    
    // Send email notification
    if (agent.email) {
      await this.emailService.sendAgentSuspensionEmail(agent.email, agent.name, body.reason);
    }

    return agent;
  }

  @Patch('agents/:agentId/ban')
  @ApiOperation({ summary: 'Ban an agent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
  })
  async banAgent(
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
    @Body() body: { reason?: string },
  ) {
    this.ensureAdmin(user);
    const agent = await this.usersService.updateAgentProfile(agentId, {
      accountStatus: 'banned',
      suspensionReason: body.reason,
    });

    // Delist all properties
    await this.housesService.delistAgentProperties(agentId);

    // Send email notification
    if (agent.email) {
      await this.emailService.sendAgentBanEmail(agent.email, agent.name, body.reason);
    }

    return agent;
  }

  @Patch('agents/:agentId/activate')
  @ApiOperation({ summary: 'Activate/reactivate an agent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
  })
  async activateAgent(
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
    @Body() body: { reason?: string },
  ) {
    this.ensureAdmin(user);
    const agent = await this.usersService.updateAgentProfile(agentId, {
      accountStatus: 'active',
      suspendedUntil: undefined,
      suspensionReason: undefined,
    });

    // Send email notification
    if (agent.email) {
      await this.emailService.sendAgentActivationEmail(agent.email, agent.name, body.reason);
    }

    return agent;
  }

  @Delete('agents/:agentId')
  @ApiOperation({ summary: 'Delete an agent account' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
  })
  async deleteAgent(
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
    @Body() body: { reason?: string },
  ) {
    this.ensureAdmin(user);
    
    // Get agent info before deletion
    const agent = await this.usersService.findById(agentId);
    
    // Delist all properties first
    await this.housesService.delistAgentProperties(agentId);
    
    // Send email notification before deletion
    if (agent?.email) {
      await this.emailService.sendAgentDeletionEmail(agent.email, agent.name, body.reason);
    }
    
    // Delete agent
    await this.usersService.delete(agentId);
    
    return { success: true, message: 'Agent deleted successfully' };
  }

  @Post('agents/:agentId/delist-properties')
  @ApiOperation({ summary: 'Delist all properties of an agent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
  })
  async delistAgentProperties(
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
    @Body() body: { reason?: string },
  ) {
    this.ensureAdmin(user);
    
    const agent = await this.usersService.findById(agentId);
    if (!agent) {
      throw new ForbiddenException('Agent not found');
    }
    
    await this.housesService.delistAgentProperties(agentId);
    
    // Send email notification
    if (agent.email) {
      await this.emailService.sendPropertiesDelistedEmail(agent.email, agent.name, body.reason);
    }
    
    return { success: true, message: 'All agent properties have been delisted' };
  }

  // ============ PROPERTY MANAGEMENT ============

  @Get('properties')
  @ApiOperation({ summary: 'Get all properties (admin)' })
  @ApiQuery({ name: 'flagged', required: false, type: 'boolean' })
  @ApiResponse({
    status: 200,
    description: 'List of properties',
  })
  async getAllProperties(
    @CurrentUser() user: RequestUser,
    @Query('flagged') flagged?: string,
  ) {
    this.ensureAdmin(user);
    const filters: any = {};
    if (flagged === 'true') {
      filters.flagged = true;
    }
    return this.housesService.findAllAdmin(filters);
  }

  @Patch('properties/:propertyId/flag')
  @ApiOperation({ summary: 'Flag a property' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
  })
  async flagProperty(
    @CurrentUser() user: RequestUser,
    @Param('propertyId') propertyId: string,
    @Body() body: { reason?: string },
  ) {
    this.ensureAdmin(user);
    return this.housesService.flagProperty(propertyId, body.reason);
  }

  @Patch('properties/:propertyId/unflag')
  @ApiOperation({ summary: 'Unflag a property' })
  async unflagProperty(
    @CurrentUser() user: RequestUser,
    @Param('propertyId') propertyId: string,
  ) {
    this.ensureAdmin(user);
    return this.housesService.unflagProperty(propertyId);
  }

  @Delete('properties/:propertyId')
  @ApiOperation({ summary: 'Delete a property (admin)' })
  async deleteProperty(
    @CurrentUser() user: RequestUser,
    @Param('propertyId') propertyId: string,
  ) {
    this.ensureAdmin(user);
    await this.housesService.delete(propertyId);
    return { success: true, message: 'Property deleted successfully' };
  }
}
