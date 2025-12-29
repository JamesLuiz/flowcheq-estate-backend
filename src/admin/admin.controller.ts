import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  private ensureAdmin(user: RequestUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
  }

  @Get('verifications/pending')
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
}
