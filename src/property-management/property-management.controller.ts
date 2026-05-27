import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PropertyManagementService } from './property-management.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CreateManagementRequestDto } from './dto/create-management-request.dto';
import { UpdateManagementRequestDto } from './dto/update-management-request.dto';
import { LocationVerifyDto } from './dto/location-verify.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UserRole } from '../users/schemas/user.schema';

@Controller()
@ApiTags('Property Management')
export class PropertyManagementController {
  constructor(private readonly service: PropertyManagementService) {}

  @Post('management-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Agent)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Agent requests to manage a property' })
  createRequest(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateManagementRequestDto,
  ) {
    return this.service.createRequest(user.sub, dto);
  }

  @Get('management-requests/outgoing')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Agent)
  @ApiBearerAuth('access-token')
  listOutgoing(@CurrentUser() user: RequestUser) {
    return this.service.listOutgoing(user.sub);
  }

  @Get('management-requests/incoming')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Landlord, UserRole.RealEstateCompany, UserRole.Company)
  @ApiBearerAuth('access-token')
  listIncoming(@CurrentUser() user: RequestUser) {
    return this.service.listIncoming(user.sub);
  }

  @Patch('management-requests/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  updateRequest(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateManagementRequestDto,
  ) {
    return this.service.updateRequest(id, user.sub, dto);
  }

  @Get('agent/managed-properties')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Agent)
  @ApiBearerAuth('access-token')
  managedProperties(@CurrentUser() user: RequestUser) {
    return this.service.listManagedProperties(user.sub);
  }

  @Get('agent/leads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Agent)
  @ApiBearerAuth('access-token')
  agentLeads(@CurrentUser() user: RequestUser) {
    return this.service.listAgentLeads(user.sub);
  }

  @Get('landlord/leads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Landlord, UserRole.RealEstateCompany, UserRole.Company)
  @ApiBearerAuth('access-token')
  landlordLeads(@CurrentUser() user: RequestUser) {
    return this.service.listLandlordLeads(user.sub);
  }

  @Patch('agent/leads/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  updateLead(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.service.updateLead(id, user.sub, dto);
  }

  @Post('properties/:id/location-verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Agent)
  @ApiBearerAuth('access-token')
  verifyLocation(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: LocationVerifyDto,
  ) {
    return this.service.verifyLocation(id, user.sub, dto);
  }
}
