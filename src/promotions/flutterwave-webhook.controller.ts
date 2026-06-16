import { Controller, Post, Body, Headers, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FlutterwaveService } from './flutterwave.service';
import { UsersService } from '../users/users.service';
import { VerificationPaymentsService } from '../youverify/verification-payments.service';

@Controller('webhooks/flutterwave')
@ApiTags('Webhooks')
export class FlutterwaveWebhookController {
  private readonly logger = new Logger(FlutterwaveWebhookController.name);

  constructor(
    private readonly flutterwaveService: FlutterwaveService,
    private readonly usersService: UsersService,
    private readonly verificationPaymentsService: VerificationPaymentsService,
  ) {}

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook endpoint for Flutterwave transfer status updates' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handleTransferWebhook(
    @Body() payload: any,
    @Headers('verif-hash') signature?: string,
  ) {
    try {
      const secretHash = process.env.FLUTTERWAVE_ENCRYPTION_KEY;
      if (secretHash && signature) {
        const isValid = await this.flutterwaveService.verifyWebhook(
          secretHash,
          payload,
          signature,
        );
        if (!isValid) {
          this.logger.warn('Invalid webhook signature');
          return { status: 'error', message: 'Invalid signature' };
        }
      }

      const event = payload.event;
      const data = payload.data;

      if (event === 'transfer.completed') {
        const reference = data.reference as string | undefined;
        const isFundingTransfer = reference && reference.startsWith('FUND-VA-');

        if (data.status === 'SUCCESSFUL') {
          if (isFundingTransfer) {
            this.logger.log(`Funding transfer completed: ${reference}`);
          } else if (reference) {
            await this.usersService.updateWithdrawalStatus(
              reference,
              'successful',
              data.complete_message || 'Transfer completed successfully',
            );
          }
        } else if (data.status === 'FAILED' && reference && !isFundingTransfer) {
          await this.usersService.updateWithdrawalStatus(
            reference,
            'failed',
            data.complete_message || 'Transfer failed',
          );
        }
      }

      return { status: 'success' };
    } catch (error: any) {
      this.logger.error('Error processing Flutterwave webhook:', error);
      return { status: 'error', message: error.message };
    }
  }

  @Post('payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook endpoint for Flutterwave payment events' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handlePaymentWebhook(
    @Body() payload: any,
    @Headers('verif-hash') signature?: string,
  ) {
    try {
      const secretHash = process.env.FLUTTERWAVE_ENCRYPTION_KEY;
      if (secretHash && signature) {
        const isValid = await this.flutterwaveService.verifyWebhook(
          secretHash,
          payload,
          signature,
        );
        if (!isValid) {
          this.logger.warn('Invalid webhook signature');
          return { status: 'error', message: 'Invalid signature' };
        }
      }

      const event = payload.event;
      const data = payload.data;

      if (event === 'charge.completed' && data.status === 'successful') {
        const meta = data.meta ?? {};
        const txRef = data.tx_ref as string | undefined;

        if (meta.type === 'verification_fee' && meta.userId && txRef) {
          const verified = await this.flutterwaveService.verifyPaymentByReference(txRef);
          if (verified.success) {
            await this.verificationPaymentsService.markFeePaidFromCheckout(
              String(meta.userId),
              txRef,
              Number(data.amount ?? verified.data?.amount ?? 0),
            );
            this.logger.log(`Verification fee recorded for user ${meta.userId}`);
          }
        }
      }

      return { status: 'success' };
    } catch (error: any) {
      this.logger.error('Error processing Flutterwave payment webhook:', error);
      return { status: 'error', message: error.message };
    }
  }
}
