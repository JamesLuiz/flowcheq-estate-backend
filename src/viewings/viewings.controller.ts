import { Controller, Post, Get, Patch, Body, Param, UseGuards, ForbiddenException, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ViewingsService } from './viewings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { ScheduleViewingDto } from './dto/schedule-viewing.dto';
import { UpdateViewingStatusDto } from './dto/update-viewing-status.dto';

@Controller('viewings')
@ApiTags('Viewings')
export class ViewingsController {
  constructor(private readonly viewingsService: ViewingsService) {}

  @Post('schedule')
  @ApiOperation({ summary: 'Schedule a property viewing' })
  @ApiResponse({
    status: 201,
    description: 'Viewing scheduled successfully',
    schema: {
      example: {
        id: '64a1f2e9c...',
        houseId: '64a1f2e9c...',
        agentId: '64a1f2e9c...',
        scheduledDate: '2025-01-15',
        scheduledTime: '10:00 AM',
        status: 'pending',
        notes: 'I would like to see the property',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 404, description: 'House or agent not found' })
  async schedule(@Body() dto: ScheduleViewingDto) {
    return this.viewingsService.schedule(dto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get viewings for authenticated agent' })
  @ApiResponse({
    status: 200,
    description: 'List of viewings for the agent',
    schema: {
      example: {
        data: [
          {
            id: '64a1f2e9c...',
            houseId: {
              _id: '64a1f2e9c...',
              title: '3 bedroom flat in Lekki',
              location: 'Lekki, Lagos',
            },
            userId: {
              _id: '64a1f2e9c...',
              name: 'John Doe',
              email: 'john@example.com',
            },
            scheduledDate: '2025-01-15',
            scheduledTime: '10:00 AM',
            status: 'pending',
            notes: 'I would like to see the property',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyViewings(@CurrentUser() user: RequestUser) {
    return this.viewingsService.getAgentViewings(user.sub);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all viewings (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all viewings',
    schema: {
      example: {
        data: [
          {
            id: '64a1f2e9c...',
            houseId: {
              _id: '64a1f2e9c...',
              title: '3 bedroom flat in Lekki',
            },
            agentId: {
              _id: '64a1f2e9c...',
              name: 'Agent Name',
            },
            scheduledDate: '2025-01-15',
            scheduledTime: '10:00 AM',
            status: 'pending',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  async getAllViewings(@CurrentUser() user: RequestUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.viewingsService.getAllViewings();
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update viewing status (agent or admin only)' })
  @ApiParam({ name: 'id', description: 'Viewing ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Viewing status updated successfully',
    schema: {
      example: {
        id: '64a1f2e9c...',
        status: 'confirmed',
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the agent or admin' })
  @ApiResponse({ status: 404, description: 'Viewing not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateViewingStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    const isAdmin = user.role === 'admin';
    return this.viewingsService.updateStatus(id, user.sub, dto.status, isAdmin);
  }

  @Post(':id/receipt')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('receipt'))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload receipt for viewing fee' })
  @ApiParam({ name: 'id', description: 'Viewing ID', example: '64a1f2e9c...' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        receipt: {
          type: 'string',
          format: 'binary',
          description: 'Receipt image file (jpg, jpeg, png, webp, max 5MB)',
        },
      },
      required: ['receipt'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Receipt uploaded successfully',
    schema: {
      example: {
        id: '64a1f2e9c...',
        receiptUrl: 'https://res.cloudinary.com/.../receipt.jpg',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not authorized' })
  @ApiResponse({ status: 404, description: 'Viewing not found' })
  async uploadReceipt(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const isAdmin = user.role === 'admin';
    return this.viewingsService.uploadReceipt(id, user.sub, file, isAdmin);
  }

  @Post(':id/payment/initialize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Initialize payment for viewing fee' })
  @ApiParam({ name: 'id', description: 'Viewing ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Payment initialized successfully',
    schema: {
      example: {
        success: true,
        paymentLink: 'https://checkout.flutterwave.com/v3/hosted/pay/abc123',
        transactionId: 'VIEWING-64a1f2e9c...-1234567890',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not authorized or already paid' })
  @ApiResponse({ status: 404, description: 'Viewing not found' })
  async initializePayment(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.viewingsService.initializeViewingPayment(id, user.sub);
  }

  @Post('payment/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verify viewing payment' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tx_ref: {
          type: 'string',
          example: 'VIEWING-64a1f2e9c...-1234567890',
        },
      },
      required: ['tx_ref'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Payment verified successfully',
    schema: {
      example: {
        id: '64a1f2e9c...',
        paymentStatus: 'paid',
        amountPaid: 5000,
        platformFee: 10,
        agentAmount: 4500,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Viewing not found' })
  async verifyPayment(
    @Body() body: { tx_ref: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.viewingsService.verifyViewingPayment(body.tx_ref, user.sub);
  }
}
