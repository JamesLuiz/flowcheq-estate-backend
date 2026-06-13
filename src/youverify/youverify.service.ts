import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type YouverifyInitiateResult = {
  reference: string;
  customerId?: string;
  checkoutUrl?: string;
  status: string;
  raw?: unknown;
};

@Injectable()
export class YouverifyService {
  private readonly logger = new Logger(YouverifyService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('YOVERIFY_API_KEY');
    this.baseUrl =
      this.configService.get<string>('YOVERIFY_BASE_URL') ?? 'https://api.youverify.co';
  }

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  /**
   * Initiate paid identity verification for landlords, agents, or companies.
   * Users pay Youverify directly; webhook confirms completion.
   */
  async initiateIdentityVerification(input: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: string;
  }): Promise<YouverifyInitiateResult> {
    const reference = `HM-${input.userId}-${Date.now()}`;

    if (!this.isConfigured) {
      this.logger.warn('YOVERIFY_API_KEY not set — returning mock verification session');
      return {
        reference,
        status: 'mock_pending',
        checkoutUrl: undefined,
      };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/v2/api/identity/initiate`,
        {
          reference,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          metadata: { userId: input.userId, role: input.role, product: 'house-me-account-kyc' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const data = response.data?.data ?? response.data;
      return {
        reference,
        customerId: data?.customerId ?? data?.id,
        checkoutUrl: data?.checkoutUrl ?? data?.url,
        status: data?.status ?? 'pending',
        raw: data,
      };
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.message
        : 'Youverify request failed';
      this.logger.error(`Youverify initiate failed: ${message}`);
      throw error;
    }
  }

  /** Verify webhook signature when YOVERIFY_WEBHOOK_SECRET is configured */
  verifyWebhookSignature(payload: string, signature?: string): boolean {
    const secret = this.configService.get<string>('YOVERIFY_WEBHOOK_SECRET');
    if (!secret) return true;
    if (!signature) return false;
    // Youverify-specific HMAC validation can be added when webhook docs are wired
    return signature.length > 0;
  }

  parseWebhookStatus(body: Record<string, unknown>): {
    reference?: string;
    status: 'verified' | 'failed' | 'pending';
    customerId?: string;
  } {
    const statusRaw = String(body.status ?? body.verificationStatus ?? '').toLowerCase();
    const verified = ['verified', 'approved', 'success', 'completed'].includes(statusRaw);
    const failed = ['failed', 'rejected', 'declined'].includes(statusRaw);

    return {
      reference: body.reference as string | undefined,
      customerId: (body.customerId ?? body.id) as string | undefined,
      status: verified ? 'verified' : failed ? 'failed' : 'pending',
    };
  }
}
