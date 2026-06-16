import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { YouverifyService } from './youverify.service';
import { VerificationPaymentsService } from './verification-payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { FlutterwaveService } from '../promotions/flutterwave.service';
import { requiresAccountVerification } from '../common/account-verification.constants';
import { ConfigService } from '@nestjs/config';

@ApiTags('Youverify')
@Controller('youverify')
export class YouverifyController {
  constructor(
    private readonly youverifyService: YouverifyService,
    private readonly verificationPaymentsService: VerificationPaymentsService,
    private readonly usersService: UsersService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly configService: ConfigService,
  ) {}

  @Get('account/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verification fee status, wallet, and SDK readiness' })
  async getAccountStatus(@CurrentUser() user: RequestUser) {
    const profile = await this.usersService.findById(user.sub);
    if (!profile) throw new BadRequestException('User not found');

    if (!requiresAccountVerification(profile.role)) {
      return { required: false, youverifyStatus: profile.youverifyStatus ?? 'not_required' };
    }

    const verificationFee = this.verificationPaymentsService.getVerificationFee();
    const payment = await this.verificationPaymentsService.getOrCreatePayment(user.sub);
    const feePaid = this.verificationPaymentsService.isVerificationFeePaid(payment);

    let walletBalance = 0;
    let virtualAccount: Record<string, string | undefined> | null = null;

    try {
      const wallet = await this.flutterwaveService.getWalletByUserId(user.sub);
      if (wallet) {
        virtualAccount = {
          accountNumber: wallet.accountNumber,
          accountName: wallet.accountName,
          bankName: wallet.bankName,
          bankCode: wallet.bankCode,
          status: wallet.status,
        };
        try {
          const balanceData = await this.flutterwaveService.getAvailableBalance(user.sub);
          walletBalance =
            balanceData.data?.available_balance || balanceData.data?.ledger_balance || 0;
          await this.usersService.updateWalletBalance(user.sub, walletBalance);
        } catch {
          walletBalance = (profile as { walletBalance?: number }).walletBalance ?? 0;
        }
      }
    } catch {
      walletBalance = (profile as { walletBalance?: number }).walletBalance ?? 0;
    }

    const sdkReady = feePaid && profile.youverifyStatus !== 'verified';

    return {
      required: true,
      youverifyStatus: profile.youverifyStatus ?? 'not_started',
      verificationFee,
      feePaid,
      paymentStatus: payment.status,
      paymentEvents: payment.events,
      checkoutReference: payment.flutterwaveReference,
      walletBalance,
      virtualAccount,
      sdkReady,
      sdkConfig: sdkReady
        ? {
            vFormId: this.configService.get<string>('YOVERIFY_VFORM_ID'),
            publicMerchantKey: this.configService.get<string>('YOVERIFY_PUBLIC_MERCHANT_KEY'),
            sandboxEnvironment:
              this.configService.get<string>('YOVERIFY_SANDBOX') === 'true',
            metadata: { userId: user.sub, product: 'flowcheq-estate' },
          }
        : null,
    };
  }

  @Post('account/pay-fee')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Start Flutterwave checkout for verification fee (before SDK)' })
  async payVerificationFee(@CurrentUser() user: RequestUser) {
    const profile = await this.usersService.findById(user.sub);
    if (!profile) throw new BadRequestException('User not found');

    if (!requiresAccountVerification(profile.role)) {
      throw new BadRequestException('Verification not required for this role');
    }

    if (profile.youverifyStatus === 'verified') {
      return { alreadyVerified: true, message: 'Already verified' };
    }

    const payment = await this.verificationPaymentsService.findLatestForUser(user.sub);
    if (this.verificationPaymentsService.isVerificationFeePaid(payment)) {
      return {
        success: true,
        alreadyPaid: true,
        message: 'Verification fee already paid. Continue with identity verification.',
      };
    }

    const fee = this.verificationPaymentsService.getVerificationFee();
    const { txRef } = await this.verificationPaymentsService.prepareCheckout(user.sub);

    const apiBase =
      this.configService.get<string>('API_BASE_URL')?.replace(/\/$/, '') ||
      'http://localhost:3000';
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:5173';

    const callbackUrl = `${apiBase}/youverify/account/fee-callback?tx_ref=${encodeURIComponent(txRef)}`;

    const paymentResult = await this.flutterwaveService.initializePayment({
      amount: fee,
      email: profile.email,
      name: profile.name,
      phone: profile.phone,
      tx_ref: txRef,
      callback_url: callbackUrl,
      meta: {
        userId: user.sub,
        type: 'verification_fee',
      },
      customizations: {
        title: 'Flowcheq Estate — Identity Verification',
        description: `Verification fee ₦${fee.toLocaleString()} (YouVerify KYC)`,
        logo: 'https://house-me.vercel.app/logo.png',
      },
    });

    return {
      success: true,
      paymentLink: paymentResult.paymentLink,
      txRef,
      amount: fee,
    };
  }

  @Get('account/fee-callback')
  @ApiOperation({ summary: 'Flutterwave redirect after verification fee checkout' })
  async verificationFeeCallback(
    @Query('tx_ref') txRef: string,
    @Query('status') status?: string,
    @Res() res?: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:5173';

    try {
      if (!txRef || status !== 'successful') {
        return res?.redirect(`${frontendUrl}/verify-account?fee=failed`);
      }

      const verification = await this.flutterwaveService.verifyPaymentByReference(txRef);
      if (!verification.success) {
        return res?.redirect(`${frontendUrl}/verify-account?fee=failed`);
      }

      const userId = verification.data?.meta?.userId as string | undefined;
      const amount = Number(verification.data?.amount ?? 0);
      if (!userId) {
        return res?.redirect(`${frontendUrl}/verify-account?fee=failed`);
      }

      await this.verificationPaymentsService.markFeePaidFromCheckout(userId, txRef, amount);
      return res?.redirect(`${frontendUrl}/verify-account?fee=success`);
    } catch {
      return res?.redirect(`${frontendUrl}/verify-account?fee=failed`);
    }
  }

  @Post('account/sdk-complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark user verified after YouVerify Web SDK vForm success' })
  async sdkComplete(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    const profile = await this.usersService.findById(user.sub);
    if (!profile) throw new BadRequestException('User not found');

    if (!requiresAccountVerification(profile.role)) {
      throw new BadRequestException('Verification not required for this role');
    }

    if (profile.youverifyStatus === 'verified') {
      return { success: true, alreadyVerified: true };
    }

    const payment = await this.verificationPaymentsService.findLatestForUser(user.sub);
    if (!this.verificationPaymentsService.isVerificationFeePaid(payment)) {
      throw new BadRequestException('Pay the verification fee before completing identity check');
    }

    const reference =
      (body.reference as string | undefined) ||
      (body.sessionId as string | undefined) ||
      `SDK-${user.sub}-${Date.now()}`;

    await this.verificationPaymentsService.markYouverifyPending(payment!, reference);

    await this.usersService.markYouverifyVerified(user.sub, {
      youverifyCustomerId: (body.id as string | undefined) ?? reference,
      youverifyPayload: body,
    });

    await this.verificationPaymentsService.markVerified(payment!, reference);

    return {
      success: true,
      verified: true,
      reference,
      message: 'Identity verified successfully via YouVerify.',
    };
  }

  @Post('account/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deprecated — use Web SDK on /verify-account' })
  async verifyAccountDeprecated() {
    throw new BadRequestException(
      'Use the YouVerify Web SDK on /verify-account after paying the verification fee.',
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
    const metadata = (parsedBody.metadata ?? (parsedBody.data as Record<string, unknown>)?.metadata) as
      | Record<string, unknown>
      | undefined;

    const userId =
      (metadata?.userId as string | undefined) ||
      (parsed.reference ? String(parsed.reference).split('-')[1] : undefined);

    if (!userId) {
      return { received: true, skipped: true };
    }

    const payment = await this.verificationPaymentsService.findLatestForUser(userId);

    if (parsed.status === 'verified') {
      if (payment && this.verificationPaymentsService.isVerificationFeePaid(payment)) {
        await this.verificationPaymentsService.markVerified(payment, parsed.reference);
      }
      await this.usersService.markYouverifyVerified(userId, {
        youverifyCustomerId: parsed.customerId,
        youverifyPayload: parsedBody,
      });
    } else if (parsed.status === 'failed') {
      if (payment) {
        await this.verificationPaymentsService.markFailed(payment, 'YouVerify webhook reported failure');
      }
      await this.usersService.updateYouverifySession(userId, {
        youverifyStatus: 'failed',
        youverifyPayload: parsedBody,
      });
    }

    return { received: true };
  }
}
