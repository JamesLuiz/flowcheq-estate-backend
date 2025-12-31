import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ViewingsService } from './viewings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('viewings')
export class ViewingsController {
  constructor(private readonly viewingsService: ViewingsService) {}

  @Post('schedule')
  async schedule(@Body() dto: {
    houseId: string;
    agentId: string;
    scheduledDate: string;
    scheduledTime: string;
    notes?: string;
    name?: string;
    email?: string;
    phone?: string;
  }) {
    return this.viewingsService.schedule(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async getMyViewings(@Request() req) {
    return this.viewingsService.getAgentViewings(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/all')
  async getAllViewings(@Request() req) {
    if (req.user.role !== 'admin') {
      throw new Error('Admin access required');
    }
    return this.viewingsService.getAllViewings();
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: { status: string },
    @Request() req,
  ) {
    const isAdmin = req.user.role === 'admin';
    return this.viewingsService.updateStatus(id, req.user.id, dto.status, isAdmin);
  }
}
