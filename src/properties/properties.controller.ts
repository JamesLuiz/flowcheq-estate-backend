import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { PropertiesService } from './properties.service';

@Controller('properties')
@ApiTags('Properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create new listing (pending verification)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: '2 Bedroom Flat, Yaba' },
        description: { type: 'string', example: 'Well ventilated and newly renovated' },
        location: { type: 'string', example: 'Yaba, Lagos' },
        price: { type: 'number', example: 18000000 },
      },
      required: ['title', 'description', 'location', 'price'],
    },
  })
  @ApiResponse({ status: 201, description: 'Property created and pending verification' })
  create(@CurrentUser() user: RequestUser, @Body() body: any) {
    return this.propertiesService.create(user.sub, body);
  }

  @Get()
  @ApiOperation({ summary: 'List active verified properties' })
  @ApiResponse({ status: 200, description: 'Properties list returned' })
  findAll(@Query() query: any) {
    return this.propertiesService.findAll(query);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Landlord's own listings (all statuses)" })
  @ApiResponse({ status: 200, description: 'Own listings returned' })
  my(@CurrentUser() user: RequestUser) {
    return this.propertiesService.myListings(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single property detail page' })
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Edit listing (owner only)' })
  @ApiResponse({ status: 200, description: 'Property updated successfully' })
  update(@Param('id') id: string, @CurrentUser() user: RequestUser, @Body() body: any) {
    return this.propertiesService.update(id, user.sub, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Soft-delete/archive listing' })
  @ApiResponse({ status: 200, description: 'Property archived successfully' })
  archive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.propertiesService.archive(id, user.sub);
  }

  @Post(':id/pause')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Temporarily hide listing' })
  @ApiResponse({ status: 200, description: 'Property paused successfully' })
  pause(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.propertiesService.pause(id, user.sub);
  }

  @Post(':id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Re-activate paused listing' })
  @ApiResponse({ status: 200, description: 'Property activated successfully' })
  activate(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.propertiesService.activate(id, user.sub);
  }

  @Post(':id/mark-rented')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark property as rented' })
  @ApiResponse({ status: 200, description: 'Property marked as rented' })
  markRented(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.propertiesService.markRented(id, user.sub);
  }

  @Post(':id/enquire')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Register enquiry' })
  @ApiResponse({ status: 200, description: 'Enquiry submitted successfully' })
  enquire(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.propertiesService.enquire(id, user.sub);
  }

  @Get(':id/contact')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reveal landlord contact post-enquiry' })
  @ApiResponse({ status: 200, description: 'Landlord contact revealed' })
  contact(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.propertiesService.contact(id, user.sub);
  }

  @Get(':id/price-comparison')
  @ApiOperation({ summary: 'Area median comparison for this property' })
  @ApiResponse({ status: 200, description: 'Comparison returned' })
  priceComparison(@Param('id') id: string) {
    return this.propertiesService.priceComparison(id);
  }
}
