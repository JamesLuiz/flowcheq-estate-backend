import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PhotoLocationVerificationService } from './photo-location-verification.service';

@Controller('verification/location')
@ApiTags('Location Verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class LocationVerificationController {
  constructor(private readonly photoVerification: PhotoLocationVerificationService) {}

  @Post('verify-photo')
  @Roles('landlord', 'real_estate_company', 'company', 'agent', 'admin', 'field_verifier')
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Verify listing/inspection photo GPS (EXIF) against expected address via Google Geocoding',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photo: { type: 'string', format: 'binary' },
        propertyId: { type: 'string' },
        expectedAddress: { type: 'string' },
        expectedLat: { type: 'number' },
        expectedLng: { type: 'number' },
        radiusMeters: { type: 'number', default: 100 },
      },
      required: ['photo'],
    },
  })
  async verifyPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      propertyId?: string;
      expectedAddress?: string;
      expectedLat?: string;
      expectedLng?: string;
      radiusMeters?: string;
    },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Photo file is required');
    }

    const radius = body.radiusMeters ? Number(body.radiusMeters) : undefined;
    const expectedLat = body.expectedLat != null ? Number(body.expectedLat) : undefined;
    const expectedLng = body.expectedLng != null ? Number(body.expectedLng) : undefined;

    if (body.propertyId) {
      return this.photoVerification.verifyPhotoForProperty(
        file,
        body.propertyId,
        radius,
      );
    }

    if (!body.expectedAddress?.trim()) {
      throw new BadRequestException(
        'Provide propertyId or expectedAddress for location comparison',
      );
    }

    return this.photoVerification.verifyPhotoWithExpectedAddress(
      file,
      body.expectedAddress.trim(),
      expectedLat,
      expectedLng,
      radius,
    );
  }
}
