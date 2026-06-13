import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PartnerLeadsService } from './partner-leads.service';
import { CreatePartnerLeadDto } from './dto/create-partner-lead.dto';
import {
  ContactPartnerLeadDto,
  UpdatePartnerLeadDto,
} from './dto/update-partner-lead.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PartnerLeadStatus } from './schemas/partner-lead.schema';

@ApiTags('Partner Leads')
@Controller()
export class PartnerLeadsController {
  constructor(private readonly service: PartnerLeadsService) {}

  @Post('partners/leads')
  @ApiOperation({ summary: 'Public landlord onboarding form submission' })
  create(@Body() dto: CreatePartnerLeadDto) {
    return this.service.createPublic(dto);
  }

  @Get('admin/partner-leads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List partner onboarding leads (admin)' })
  list(@Query('status') status?: PartnerLeadStatus) {
    return this.service.findAll(status);
  }

  @Get('admin/partner-leads/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('admin/partner-leads/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  update(@Param('id') id: string, @Body() dto: UpdatePartnerLeadDto) {
    return this.service.update(id, dto);
  }

  @Post('admin/partner-leads/:id/contact')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Send email or get WhatsApp link for landlord lead' })
  contact(@Param('id') id: string, @Body() dto: ContactPartnerLeadDto) {
    return this.service.contact(id, dto);
  }
}
