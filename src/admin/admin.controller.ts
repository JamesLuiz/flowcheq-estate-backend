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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
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
            verificationStatus: 'pending'
          }
        ]
      }
    }
  })
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
  @ApiResponse({ status: 200, description: 'Updated agent profile' })
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
  @ApiResponse({ status: 200, description: 'List of promotions' })
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
  @ApiResponse({ status: 200, description: 'Activated promotion' })
  async activatePromotion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);
    return this.promotionsService.activate(id);
  }

  @Delete('promotions/:id')
  @ApiOperation({ summary: 'Cancel a promotion (admin)' })
  @ApiResponse({ status: 200, description: 'Canceled promotion' })
  async cancelPromotion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);
    return this.promotionsService.adminCancel(id);
  }
}
