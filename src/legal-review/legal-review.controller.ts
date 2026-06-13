import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LegalReviewService } from './legal-review.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { ApproveCofoDto, RejectListingDto } from './dto/legal-review.dto';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Legal Review')
@Controller('legal-review')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Lawyer, UserRole.Admin)
@ApiBearerAuth('access-token')
export class LegalReviewController {
  constructor(private readonly service: LegalReviewService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Listings awaiting lawyer document review' })
  listPending() {
    return this.service.listPending();
  }

  @Get('check-certificate')
  @ApiOperation({ summary: 'Check if C of O certificate is already on a verified listing' })
  checkCertificate(
    @Query('certificateNumber') certificateNumber: string,
    @Query('excludeHouseId') excludeHouseId?: string,
  ) {
    return this.service.checkDuplicateCertificate(certificateNumber, excludeHouseId);
  }

  @Get(':houseId')
  @ApiOperation({ summary: 'Listing detail for legal review' })
  getOne(@Param('houseId') houseId: string) {
    return this.service.getOne(houseId);
  }

  @Post(':houseId/approve')
  @ApiOperation({ summary: 'Approve ownership documents and enter C of O details' })
  approve(
    @Param('houseId') houseId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ApproveCofoDto,
  ) {
    return this.service.approve(houseId, user.sub, dto);
  }

  @Post(':houseId/reject')
  @ApiOperation({ summary: 'Reject listing verification' })
  reject(
    @Param('houseId') houseId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RejectListingDto,
  ) {
    return this.service.reject(houseId, user.sub, dto);
  }
}
