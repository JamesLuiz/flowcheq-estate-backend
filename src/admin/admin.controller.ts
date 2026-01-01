import {
  Controller,
  Get,
  Param,
  Patch,
  Delete,
  Query,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UsersService } from '../users/users.service';
import { PromotionsService } from '../promotions/promotions.service';
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
}
