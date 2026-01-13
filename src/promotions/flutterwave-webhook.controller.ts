import { Controller, Post, Body, Headers, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FlutterwaveService } from './flutterwave.service';
import { UsersService } from '../users/users.service';
import * as crypto from 'crypto';

@Controller('webhooks/flutterwave')
@ApiTags('Webhooks')
export class FlutterwaveWebhookController {
  private readonly logger = new Logger(FlutterwaveWebhookController.name);

  constructor(
    private readonly flutterwaveService: FlutterwaveService,
    private readonly usersService: UsersService,
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
      // Verify webhook signature if secret hash is configured
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

      // Handle transfer webhook
      const event = payload.event;
      const data = payload.data;

      if (event === 'transfer.completed') {
        this.logger.log(`Transfer completed: ${data.id}, Status: ${data.status}, Reference: ${data.reference}`);
        
        // Check if this is a funding transfer (to virtual account) or withdrawal transfer
        const reference = data.reference;
        const isFundingTransfer = reference && reference.startsWith('FUND-VA-');
        
        if (data.status === 'SUCCESSFUL') {
          if (isFundingTransfer) {
            // This is a transfer TO a virtual account (funding)
            // The local balance was already updated when the transfer was initiated
            // The Flutterwave balance will be synced when the user checks their balance next
            this.logger.log(`Funding transfer completed successfully. Reference: ${reference}. Balance will sync on next check.`);
          } else {
            // This is a withdrawal transfer (from virtual account)
            if (reference) {
              await this.usersService.updateWithdrawalStatus(
                reference,
                'successful',
                data.complete_message || 'Transfer completed successfully',
              );
              this.logger.log(`Withdrawal ${reference} marked as successful`);
            }
          }
        } else if (data.status === 'FAILED') {
          if (isFundingTransfer) {
            this.logger.warn(`Funding transfer failed: ${reference}. Manual intervention may be required.`);
            // TODO: Could reverse the local balance update here if needed
          } else {
            // Withdrawal failed
            if (reference) {
              await this.usersService.updateWithdrawalStatus(
                reference,
                'failed',
                data.complete_message || 'Transfer failed',
              );
              this.logger.log(`Withdrawal ${reference} marked as failed`);
            }
          }
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
      // Verify webhook signature if secret hash is configured
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

      // Handle payment webhook events
      const event = payload.event;
      const data = payload.data;

      this.logger.log(`Payment webhook received: ${event}`);
      this.logger.log(`Payment webhook data: ${JSON.stringify(data, null, 2)}`);

      // Handle successful payment events
      if (event === 'charge.completed' && data.status === 'successful') {
        this.logger.log(`Payment successful: Transaction ID ${data.id}, Amount: ${data.amount} ${data.currency}, Reference: ${data.tx_ref}`);
        
        // Log split payment information if available
        if (data.meta && data.meta.subaccounts) {
          this.logger.log(`Split payment details: ${JSON.stringify(data.meta.subaccounts)}`);
        }
        
        // Check if this is a viewing payment
        if (data.meta && data.meta.viewingId) {
          this.logger.log(`Viewing payment completed for viewing ID: ${data.meta.viewingId}`);
          // The viewing payment verification will be handled by the callback endpoint
        }
      } else if (event === 'charge.completed' && data.status === 'failed') {
        this.logger.warn(`Payment failed: Transaction ID ${data.id}, Reference: ${data.tx_ref}, Message: ${data.processor_response || 'Unknown error'}`);
      }

      return { status: 'success' };
    } catch (error: any) {
      this.logger.error('Error processing Flutterwave payment webhook:', error);
      return { status: 'error', message: error.message };
    }
  }
}

