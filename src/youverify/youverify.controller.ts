import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { YouverifyService } from './youverify.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { CloudinaryService } from '../houses/cloudinary.service';

const ACCOUNT_VERIFICATION_ROLES = new Set([
  'landlord',
  'agent',
  'company',
  'real_estate_company',
  'user',
  'tenant',
  'house_hunter',
  'lawyer',
]);

@ApiTags('Youverify')
@Controller('youverify')
export class YouverifyController {
  constructor(
    private readonly youverifyService: YouverifyService,
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post('account/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(FileInterceptor('selfie'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Verify account identity via YouVerify (NIN or driver license + selfie)',
  })
  async verifyAccount(
    @CurrentUser() user: RequestUser,
    @UploadedFile() selfie: Express.Multer.File,
    @Body('documentType') documentType: string,
    @Body('idNumber') idNumber: string,
    @Body('firstName') firstName: string,
    @Body('lastName') lastName: string,
    @Body('dateOfBirth') dateOfBirth?: string,
    @Body('isSubjectConsent') isSubjectConsent?: string,
  ) {
    const profile = await this.usersService.findById(user.sub);
    if (!profile) throw new BadRequestException('User not found');

    if (!ACCOUNT_VERIFICATION_ROLES.has(profile.role)) {
      throw new BadRequestException('Account verification is not available for this role');
    }

    if (profile.youverifyStatus === 'verified') {
      return { alreadyVerified: true, message: 'Account already verified with YouVerify' };
    }

    const consent = isSubjectConsent === 'true' || isSubjectConsent === '1';
    if (!consent) {
      throw new BadRequestException('Subject consent is required for identity verification');
    }

    if (!documentType || !['nin', 'driver_license'].includes(documentType)) {
      throw new BadRequestException('documentType must be nin or driver_license');
    }

    if (!idNumber?.trim() || idNumber.trim().length < 5) {
      throw new BadRequestException('A valid ID number is required');
    }

    if (!firstName?.trim() || !lastName?.trim()) {
      throw new BadRequestException('First and last name are required');
    }

    if (!selfie) {
      throw new BadRequestException('Selfie photo is required');
    }

    const allowedSelfieTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedSelfieTypes.includes(selfie.mimetype)) {
      throw new BadRequestException('Selfie must be JPG or PNG');
    }

    if (selfie.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Selfie must be smaller than 5MB');
    }

    const upload = await this.cloudinaryService.uploadToCloudinaryWithPublicId(
      selfie.buffer,
      selfie.originalname,
      'flowcheq-estate/kyc-selfies',
    );

    const result = await this.youverifyService.verifyIdentityWithSelfie({
      userId: user.sub,
      role: profile.role,
      documentType: documentType as 'nin' | 'driver_license',
      idNumber: idNumber.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: dateOfBirth?.trim() || undefined,
      selfieUrl: upload.url,
    });

    if (result.verified) {
      await this.usersService.markYouverifyVerified(user.sub, {
        youverifyCustomerId: result.customerId,
        youverifyPayload: result.raw as Record<string, unknown> | undefined,
      });
      await this.usersService.updateYouverifySession(user.sub, {
        youverifyReference: result.reference,
      });

      return {
        success: true,
        verified: true,
        reference: result.reference,
        message: result.message,
      };
    }

    await this.usersService.updateYouverifySession(user.sub, {
      youverifyReference: result.reference,
      youverifyCustomerId: result.customerId,
      youverifyStatus: 'failed',
      youverifyPayload: result.raw as Record<string, unknown> | undefined,
    });

    return {
      success: false,
      verified: false,
      reference: result.reference,
      message: result.message,
    };
  }

  @Post('account/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Deprecated — use POST /youverify/account/verify with NIN/license + selfie',
  })
  async initiate(@CurrentUser() user: RequestUser) {
    const profile = await this.usersService.findById(user.sub);
    if (!profile) throw new BadRequestException('User not found');

    if (!ACCOUNT_VERIFICATION_ROLES.has(profile.role)) {
      throw new BadRequestException(
        'YouVerify account verification is required for agents, landlords, companies, house hunters, and law firm partners',
      );
    }

    if (profile.youverifyStatus === 'verified') {
      return { alreadyVerified: true, message: 'Account already verified with YouVerify' };
    }

    throw new BadRequestException(
      'Use POST /youverify/account/verify with your NIN or driver license number and a selfie photo. Manual verification is no longer accepted.',
    );
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Youverify webhook callback (HMAC x-youverify-signature)' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: Record<string, unknown>,
    @Headers('x-youverify-signature') signature?: string,
  ) {
    const rawBody =
      req.rawBody?.length != null && req.rawBody.length > 0
        ? req.rawBody.toString('utf8')
        : JSON.stringify(body ?? {});

    if (!this.youverifyService.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let parsedBody: Record<string, unknown>;
    try {
      parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    const parsed = this.youverifyService.parseWebhookStatus(parsedBody);
    if (!parsed.reference) {
      return { received: true, skipped: true };
    }

    const userId = String(parsed.reference).split('-')[1];
    if (!userId) return { received: true, skipped: true };

    if (parsed.status === 'verified') {
      await this.usersService.markYouverifyVerified(userId, {
        youverifyCustomerId: parsed.customerId,
        youverifyPayload: parsedBody,
      });
    } else if (parsed.status === 'failed') {
      await this.usersService.updateYouverifySession(userId, {
        youverifyStatus: 'failed',
        youverifyPayload: parsedBody,
      });
    }

    return { received: true };
  }
}
