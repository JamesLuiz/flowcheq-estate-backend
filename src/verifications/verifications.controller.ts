import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Body,
  Param,
  Query,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { VerificationsService } from './verifications.service';
import { UploadVerificationDto } from './dto/upload-verification.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { ForbiddenException } from '@nestjs/common';

@Controller('verifications')
@UseGuards(JwtAuthGuard)
export class VerificationsController {
  constructor(private readonly verificationsService: VerificationsService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'document', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  async uploadVerification(
    @CurrentUser() user: RequestUser,
    @Body() dto: UploadVerificationDto,
    @UploadedFiles()
    files: {
      document?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
  ) {
    if (!files.document || !files.document[0]) {
      throw new BadRequestException('Document file is required');
    }
    if (!files.selfie || !files.selfie[0]) {
      throw new BadRequestException('Selfie/Passport photo is required');
    }

    return this.verificationsService.uploadVerification(
      user.sub,
      dto.documentType,
      files.document[0],
      files.selfie[0],
    );
  }

  @Get('me')
  async getMyVerification(@CurrentUser() user: RequestUser) {
    return this.verificationsService.getUserVerification(user.sub);
  }

  @Get('admin/all')
  async getAllVerifications(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.verificationsService.getAllVerifications(status as any);
  }

  @Get('admin/:id')
  async getVerificationById(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.verificationsService.getVerificationById(id);
  }

  @Post('admin/:id/review')
  async reviewVerification(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewVerificationDto,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.verificationsService.reviewVerification(
      id,
      user.sub,
      dto.status,
      dto.rejectionReason,
      dto.adminMessage,
    );
  }

  @Delete('admin/:id')
  async deleteVerification(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.verificationsService.deleteVerification(id);
  }
}

