import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { PromotionsService } from './promotions.service';
import { FlutterwaveService } from './flutterwave.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CloudinaryService } from '../houses/cloudinary.service';
import { EmailService } from '../auth/email.service';
import { Inject, forwardRef } from '@nestjs/common';
import { Logger } from '@nestjs/common';

@Controller('promotions')
@ApiTags('Promotions')
export class PromotionsController {
  private readonly logger = new Logger(PromotionsController.name);

  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly flutterwaveService: FlutterwaveService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
  ) {}

  @Get('active')
  @ApiOperation({ summary: 'Get currently active promotions' })
  @ApiResponse({
    status: 200,
    description: 'Active promotions list',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            houseId: {
              _id: '64a1f2e9c...',
              title: '3 bedroom flat in Lekki',
              price: 15000000,
              location: 'Lekki, Lagos',
              images: ['https://res.cloudinary.com/.../image1.jpg'],
            },
            bannerImage: 'https://res.cloudinary.com/.../banner.jpg',
            startDate: '2025-01-01T00:00:00.000Z',
            endDate: '2025-01-08T00:00:00.000Z',
            clicks: 10,
          },
        ],
      },
    },
  })
  async getActivePromotions() {
    return this.promotionsService.findActivePromotions();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get promotions for authenticated user' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'cancelled'], description: 'Filter by status' })
  @ApiResponse({
    status: 200,
    description: 'List of promotions for user',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            houseId: {
              _id: '64a1f2e9c...',
              title: '3 bedroom flat in Lekki',
            },
            bannerImage: 'https://res.cloudinary.com/.../banner.jpg',
            startDate: '2025-01-01T00:00:00.000Z',
            endDate: '2025-01-08T00:00:00.000Z',
            status: 'active',
            clicks: 10,
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllPromotions(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
  ) {
    return this.promotionsService.findAll({
      status: status as any,
      userId: user.sub,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get promotion by id' })
  @ApiParam({ name: 'id', description: 'Promotion ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Promotion details',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        houseId: {
          _id: '64a1f2e9c...',
          title: '3 bedroom flat in Lekki',
          price: 15000000,
          location: 'Lekki, Lagos',
        },
        userId: {
          _id: '64a1f2e9c...',
          name: 'Agent Name',
        },
        bannerImage: 'https://res.cloudinary.com/.../banner.jpg',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-08T00:00:00.000Z',
        status: 'active',
        clicks: 10,
        amount: 70000,
        paymentReference: 'FLW-TRX-123456',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async getPromotion(@Param('id') id: string) {
    return this.promotionsService.findOne(id);
  }

  @Post('initialize-payment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Initialize payment for promotion' })
  @ApiResponse({
    status: 200,
    description: 'Payment initialization payload',
    schema: {
      example: {
        status: 'success',
        message: 'Hosted Link',
        data: {
          link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc123',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'House not found' })
  async initializePayment(
    @CurrentUser() user: RequestUser,
    @Body() body: { houseId: string; days: number; email: string; name: string; phone?: string },
  ) {
    const PRICE_PER_DAY = 10000; // 10,000 Naira per day
    const amount = body.days * PRICE_PER_DAY;
    const txRef = `PROMO-${body.houseId}-${Date.now()}`;

    const apiBase = process.env.API_BASE_URL || 'http://localhost:3000';
    const payment = await this.flutterwaveService.initializePayment({
      amount,
      email: body.email,
      name: body.name,
      phone: body.phone,
      tx_ref: txRef,
      // Redirect/callback should go to the backend API so server can verify and create promotions
      callback_url: `${apiBase.replace(/\/$/, '')}/promotions/callback?tx_ref=${txRef}`,
      meta: {
        houseId: body.houseId,
        days: body.days,
        userId: user.sub,
      },
    });

    return payment;
  }

  @Post('verify-payment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verify payment and create promotion' })
  @ApiResponse({
    status: 200,
    description: 'Promotion created after verification',
    schema: {
      example: {
        success: true,
        promotion: {
          _id: '64a1f2e9c...',
          houseId: '64a1f2e9c...',
          bannerImage: 'https://res.cloudinary.com/.../banner.jpg',
          status: 'active',
          startDate: '2025-01-01T00:00:00.000Z',
          endDate: '2025-01-08T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error or payment verification failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'House not found' })
  async verifyPayment(
    @CurrentUser() user: RequestUser,
    @Body() body: { transactionId: string; houseId: string; days: number; startDate: string; bannerImage: string },
  ) {
    const verification = await this.flutterwaveService.verifyPayment(body.transactionId);
    
    if (!verification.success) {
      throw new Error('Payment verification failed');
    }

    // Create promotion after successful payment
    const dto: CreatePromotionDto = {
      houseId: body.houseId,
      bannerImage: body.bannerImage,
      startDate: body.startDate,
      days: body.days,
      amount: verification.amount,
      paymentReference: body.transactionId,
    };

    const promotion = await this.promotionsService.create(user.sub, dto);
    
    // Activate promotion
    await this.promotionsService.activate(promotion.id);

    // Send email notifications
    try {
      const promotionDetails = await this.promotionsService.findOne(promotion.id);
      const house = promotionDetails.houseId as any;
      const agent = promotionDetails.userId as any;

      if (agent?.email) {
        const endDate = new Date(body.startDate);
        endDate.setDate(endDate.getDate() + body.days);

        await this.emailService.sendPromotionPaymentConfirmationEmail(
          agent.email,
          agent.name || 'Agent',
          verification.amount,
          house?.title || 'Property',
          body.days,
          body.startDate,
          endDate.toISOString(),
        );
      }
    } catch (error) {
      this.logger.error('Failed to send promotion payment confirmation email:', error);
    }

    return { success: true, promotion };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('bannerImage'))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a promotion with uploaded banner' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        houseId: { type: 'string', example: '64a1f2e7b9a5a3f1d0e4c2b1' },
        startDate: { type: 'string', example: '2025-01-01T00:00:00.000Z' },
        days: { type: 'number', example: 7, minimum: 1 },
        amount: { type: 'number', example: 70000 },
        paymentReference: { type: 'string', example: 'FLW-TRX-123456' },
        bannerImage: {
          type: 'string',
          format: 'binary',
          description: 'Banner image file (jpg, jpeg, png, webp, max 5MB)',
        },
      },
      required: ['houseId', 'startDate', 'days', 'amount', 'paymentReference', 'bannerImage'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Promotion created',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        houseId: '64a1f2e9c...',
        userId: '64a1f2e9c...',
        bannerImage: 'https://res.cloudinary.com/.../banner.jpg',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-08T00:00:00.000Z',
        status: 'inactive',
        days: 7,
        amount: 70000,
        paymentReference: 'FLW-TRX-123456',
        clicks: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'House not found' })
  async createPromotion(
    @CurrentUser() user: RequestUser,
    @Body() body: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    // Upload banner image
    const bannerImage = await this.cloudinaryService.uploadToCloudinary(
      file.buffer,
      `promotion-banner-${user.sub}-${Date.now()}`,
    );

    const dto: CreatePromotionDto = {
      houseId: body.houseId,
      bannerImage,
      startDate: body.startDate,
      days: parseInt(body.days, 10),
      amount: parseFloat(body.amount),
      paymentReference: body.paymentReference,
    };

    return this.promotionsService.create(user.sub, dto);
  }

  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Activate a promotion' })
  @ApiParam({ name: 'id', description: 'Promotion ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Promotion activated',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        status: 'active',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-08T00:00:00.000Z',
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the promotion owner' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async activatePromotion(@Param('id') id: string) {
    return this.promotionsService.activate(id);
  }

  @Post(':id/click')
  @ApiOperation({ summary: 'Track click on promotion' })
  @ApiParam({ name: 'id', description: 'Promotion ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Click tracked',
    schema: {
      example: {
        success: true,
        clicks: 11,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async trackClick(@Param('id') id: string) {
    await this.promotionsService.trackClick(id);
    return { success: true };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel a promotion' })
  @ApiParam({ name: 'id', description: 'Promotion ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Promotion cancelled',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        status: 'cancelled',
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the promotion owner' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async cancelPromotion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.promotionsService.cancel(id, user.sub);
  }
}

