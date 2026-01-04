import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('FLUTTERWAVE_SECRET_KEY') || '';
  }

  async initializePayment(data: {
    amount: number;
    email: string;
    name: string;
    phone?: string;
    tx_ref: string;
    callback_url: string;
    meta?: Record<string, any>;
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/payments`,
        {
          tx_ref: data.tx_ref,
          amount: data.amount,
          currency: 'NGN',
          redirect_url: data.callback_url,
          payment_options: 'card, banktransfer, ussd',
          customer: {
            email: data.email,
            name: data.name,
            phone_number: data.phone || '',
          },
          customizations: {
            title: 'House Me - Property Promotion',
            description: `Promote property for ${data.amount} Naira`,
            logo: 'https://house-me.vercel.app/logo.png',
          },
          meta: data.meta || {},
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: true,
        paymentLink: response.data.data.link,
        transactionId: response.data.data.tx_ref,
      };
    } catch (error: any) {
      this.logger.error('Flutterwave payment initialization error:', error.response?.data || error.message);
      throw new Error('Failed to initialize payment');
    }
  }

  async verifyPayment(transactionId: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transactions/${transactionId}/verify`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const transaction = response.data.data;
      return {
        success: transaction.status === 'successful',
        amount: transaction.amount,
        currency: transaction.currency,
        txRef: transaction.tx_ref,
        status: transaction.status,
        customer: transaction.customer,
      };
    } catch (error: any) {
      this.logger.error('Flutterwave payment verification error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Payment verification failed',
      };
    }
  }

  async verifyWebhook(secretHash: string, payload: any, signature: string): Promise<boolean> {
    const hash = require('crypto')
      .createHmac('sha256', secretHash)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hash === signature;
  }

  async initiateTransfer(data: {
    account_bank: string; // Bank code
    account_number: string;
    amount: number;
    narration: string;
    currency?: string;
    beneficiary_name?: string;
    reference?: string;
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/transfers`,
        {
          account_bank: data.account_bank,
          account_number: data.account_number,
          amount: data.amount,
          narration: data.narration,
          currency: data.currency || 'NGN',
          beneficiary_name: data.beneficiary_name,
          reference: data.reference || `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: true,
        transferId: response.data.data.id,
        reference: response.data.data.reference,
        status: response.data.data.status,
        amount: response.data.data.amount,
      };
    } catch (error: any) {
      this.logger.error('Flutterwave transfer initiation error:', error.response?.data || error.message);
      throw new Error(`Failed to initiate transfer: ${error.response?.data?.message || error.message}`);
    }
  }

  async verifyTransfer(transferId: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transfers/${transferId}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const transfer = response.data.data;
      return {
        success: transfer.status === 'SUCCESSFUL',
        status: transfer.status,
        amount: transfer.amount,
        reference: transfer.reference,
        complete_message: transfer.complete_message,
        created_at: transfer.created_at,
      };
    } catch (error: any) {
      this.logger.error('Flutterwave transfer verification error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Transfer verification failed',
      };
    }
  }
}

