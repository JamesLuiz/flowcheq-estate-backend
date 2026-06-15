import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { YouverifyService } from './youverify.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';

@ApiTags('Youverify')
@Controller('youverify')
export class YouverifyController {
  constructor(
    private readonly youverifyService: YouverifyService,
    private readonly usersService: UsersService,
  ) {}

  @Post('account/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Start paid Youverify identity check for account creation (landlord/agent/company)',
  })
  async initiate(@CurrentUser() user: RequestUser) {
    const profile = await this.usersService.findById(user.sub);
    if (!profile) throw new BadRequestException('User not found');

    const allowedRoles = ['landlord', 'agent', 'company', 'real_estate_company'];
    if (!allowedRoles.includes(profile.role)) {
      throw new BadRequestException(
        'Youverify account verification is for landlords, agents, and companies only',
      );
    }

    if (profile.youverifyStatus === 'verified') {
      return { alreadyVerified: true, message: 'Account already verified with Youverify' };
    }

    const [firstName, ...rest] = (profile.name ?? 'User').split(' ');
    const session = await this.youverifyService.initiateIdentityVerification({
      userId: user.sub,
      email: profile.email,
      firstName,
      lastName: rest.join(' ') || firstName,
      phone: profile.phone,
      role: profile.role,
    });

    await this.usersService.updateYouverifySession(user.sub, {
      youverifyReference: session.reference,
      youverifyCustomerId: session.customerId,
      youverifyStatus: 'in_progress',
      youverifyPayload: session.raw as Record<string, unknown> | undefined,
    });

    return {
      reference: session.reference,
      checkoutUrl: session.checkoutUrl,
      status: session.status,
      message: session.checkoutUrl
        ? 'Complete payment and verification on Youverify'
        : 'Verification session created — configure YOVERIFY_API_KEY for live checkout URL',
    };
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
