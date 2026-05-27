import { Controller, Get, Post, Query, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AreaRentIndexService } from './area-rent-index.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('area-rent-index')
@ApiTags('Area Rent Index')
export class AreaRentIndexController {
  constructor(private readonly areaRentIndexService: AreaRentIndexService) {}

  @Get(':district')
  @ApiOperation({ summary: 'ARI for a district (all property types)' })
  @ApiResponse({ status: 200, description: 'District ARI returned' })
  district(@Param('district') district: string) {
    return this.areaRentIndexService.getDistrict(district);
  }

  @Get(':district/:type/:bedrooms')
  @ApiOperation({ summary: 'Specific ARI band by district/type/bedrooms' })
  specific(
    @Param('district') district: string,
    @Param('type') type: string,
    @Param('bedrooms') bedrooms: string,
  ) {
    return this.areaRentIndexService.getSpecific(district, type, Number(bedrooms));
  }

  @Get('compare')
  @ApiOperation({ summary: 'Compare ARI across districts' })
  compare(@Query('districts') districts: string) {
    const parsed = districts ? districts.split(',').map((d) => d.trim()) : [];
    return this.areaRentIndexService.compare(parsed);
  }

  @Post('recompute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Manually trigger ARI recomputation (admin)' })
  recompute(@CurrentUser() user: RequestUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.areaRentIndexService.recompute();
  }

  @Get('public-dashboard')
  @ApiOperation({ summary: 'Public dashboard dataset' })
  publicDashboard() {
    return this.areaRentIndexService.publicDashboard();
  }
}
