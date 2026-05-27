import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { LegalDocumentsService } from './legal-documents.service';

@Controller('legal-documents')
@ApiTags('Legal Documents')
export class LegalDocumentsController {
  constructor(private readonly legalDocumentsService: LegalDocumentsService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Start legal document generation (tenant)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        propertyId: { type: 'string', example: '6812f08d5f8f6f8d8833d123' },
        landlordId: { type: 'string', example: '6812f08d5f8f6f8d8833d124' },
        state: { type: 'string', example: 'Lagos' },
      },
      required: ['propertyId', 'landlordId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Legal document initiated' })
  initiate(@CurrentUser() user: RequestUser, @Body() body: any) {
    return this.legalDocumentsService.initiate(user.sub, body);
  }

  @Post(':id/pay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Pay legal document fee (N15,000)' })
  pay(@Param('id') id: string) {
    return this.legalDocumentsService.pay(id);
  }

  @Post('payment-callback')
  @ApiOperation({ summary: 'Payment provider callback webhook' })
  paymentCallback(@Body() body: any) {
    return this.legalDocumentsService.paymentCallback(body);
  }

  @Get(':id/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant', 'landlord', 'real_estate_company', 'admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Preview pre-filled legal document' })
  preview(@Param('id') id: string) {
    return this.legalDocumentsService.preview(id);
  }

  @Post(':id/sign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant', 'landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Submit e-signature' })
  sign(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: { role: 'tenant' | 'landlord'; signatureImageUrl?: string },
  ) {
    return this.legalDocumentsService.sign(id, user.sub, body.role, body.signatureImageUrl);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant', 'landlord', 'real_estate_company', 'admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Download executed legal document' })
  download(@Param('id') id: string) {
    return this.legalDocumentsService.download(id);
  }

  @Get(':id/audit-trail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Full document audit trail (admin)' })
  auditTrail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.legalDocumentsService.auditTrail(id);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant', 'landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Own legal documents history' })
  my(@CurrentUser() user: RequestUser) {
    return this.legalDocumentsService.my(user.sub);
  }

  @Get('templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Manage legal templates (admin)' })
  templates(@CurrentUser() user: RequestUser) {
    return this.legalDocumentsService.templates();
  }

  @Post('templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload legal template (admin)' })
  uploadTemplate(@CurrentUser() user: RequestUser, @Body() body: any) {
    return this.legalDocumentsService.uploadTemplate(body);
  }
}
