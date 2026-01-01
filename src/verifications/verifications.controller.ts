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
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { VerificationsService } from './verifications.service';
import { UploadVerificationDto } from './dto/upload-verification.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('verifications')
@UseGuards(JwtAuthGuard)
@ApiTags('Verifications')
@ApiBearerAuth('access-token')
export class VerificationsController {
  constructor(private readonly verificationsService: VerificationsService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'document', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  @ApiOperation({ summary: 'Upload verification documents' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          enum: ['nin', 'driver_license'],
          example: 'nin',
        },
        document: {
          type: 'string',
          format: 'binary',
          description: 'Document file (NIN or Driver License) - max 5MB',
        },
        selfie: {
          type: 'string',
          format: 'binary',
          description: 'Selfie/Passport photo - max 5MB',
        },
      },
      required: ['documentType', 'document', 'selfie'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Verification documents uploaded successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        userId: '64a1f2e9c...',
        documentType: 'nin',
        documentUrl: 'https://res.cloudinary.com/.../document.jpg',
        selfieUrl: 'https://res.cloudinary.com/.../selfie.jpg',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - missing files or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiOperation({ summary: 'Get current user verification status' })
  @ApiResponse({
    status: 200,
    description: 'User verification details',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        userId: '64a1f2e9c...',
        documentType: 'nin',
        documentUrl: 'https://res.cloudinary.com/.../document.jpg',
        selfieUrl: 'https://res.cloudinary.com/.../selfie.jpg',
        status: 'pending',
        rejectionReason: null,
        adminMessage: null,
        reviewedAt: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'No verification found for user' })
  async getMyVerification(@CurrentUser() user: RequestUser) {
    return this.verificationsService.getUserVerification(user.sub);
  }

  @Get('admin/all')
  @ApiOperation({ summary: 'Get all verifications (admin only)' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'], description: 'Filter by status' })
  @ApiResponse({
    status: 200,
    description: 'List of all verifications',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            userId: {
              _id: '64a1f2e9c...',
              name: 'Agent Name',
              email: 'agent@example.com',
            },
            documentType: 'nin',
            status: 'pending',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
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
  @ApiOperation({ summary: 'Get verification by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'Verification ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Verification details',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        userId: {
          _id: '64a1f2e9c...',
          name: 'Agent Name',
          email: 'agent@example.com',
        },
        documentType: 'nin',
        documentUrl: 'https://res.cloudinary.com/.../document.jpg',
        selfieUrl: 'https://res.cloudinary.com/.../selfie.jpg',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
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
  @ApiOperation({ summary: 'Review a verification (admin only)' })
  @ApiParam({ name: 'id', description: 'Verification ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Verification reviewed successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        status: 'approved',
        reviewedAt: '2025-01-01T12:00:00.000Z',
        reviewedBy: '64a1f2e9c...',
        adminMessage: 'Verification approved',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
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
  @ApiOperation({ summary: 'Delete a verification (admin only)' })
  @ApiParam({ name: 'id', description: 'Verification ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Verification deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Verification deleted',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
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

