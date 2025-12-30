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
import { FileInterceptor } from '@nestjs/platform-express';
import { PromotionsService } from './promotions.service';
import { FlutterwaveService } from './flutterwave.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CloudinaryService } from '../houses/cloudinary.service';

@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  @Get('active')
  async getActivePromotions() {
    return this.promotionsService.findActivePromotions();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
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
  async getPromotion(@Param('id') id: string) {
    return this.promotionsService.findOne(id);
  }

  @Post('initialize-payment')
  @UseGuards(JwtAuthGuard)
  async initializePayment(
    @CurrentUser() user: RequestUser,
    @Body() body: { houseId: string; days: number; email: string; name: string; phone?: string },
  ) {
    const PRICE_PER_DAY = 10000; // 10,000 Naira per day
    const amount = body.days * PRICE_PER_DAY;
    const txRef = `PROMO-${body.houseId}-${Date.now()}`;

    const payment = await this.flutterwaveService.initializePayment({
      amount,
      email: body.email,
      name: body.name,
      phone: body.phone,
      tx_ref: txRef,
      callback_url: `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/promotions/callback?tx_ref=${txRef}`,
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

    return { success: true, promotion };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('bannerImage'))
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
  async activatePromotion(@Param('id') id: string) {
    return this.promotionsService.activate(id);
  }

  @Post(':id/click')
  async trackClick(@Param('id') id: string) {
    await this.promotionsService.trackClick(id);
    return { success: true };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async cancelPromotion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.promotionsService.cancel(id, user.sub);
  }
}

