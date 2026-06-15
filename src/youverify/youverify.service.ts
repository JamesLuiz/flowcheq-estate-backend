import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

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
          metadata: { userId: input.userId, role: input.role, product: 'flowcheq-estate-account-kyc' },
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

  /**
   * Verify x-youverify-signature (HMAC-SHA256 of raw JSON body).
   * @see https://doc.youverify.co/webhooks
   */
  verifyWebhookSignature(rawPayload: string, signature?: string): boolean {
    const secret = this.configService.get<string>('YOVERIFY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn(
        'YOVERIFY_WEBHOOK_SECRET not set — webhooks are accepted without signature verification',
      );
      return true;
    }
    if (!signature?.trim()) {
      return false;
    }

    const expectedHex = createHmac('sha256', secret).update(rawPayload, 'utf8').digest('hex');
    const received = signature.trim().replace(/^sha256=/i, '').toLowerCase();

    if (this.safeEqualHex(received, expectedHex)) {
      return true;
    }

    const expectedBase64 = createHmac('sha256', secret)
      .update(rawPayload, 'utf8')
      .digest('base64');
    const receivedBase64 = signature.trim().replace(/^sha256=/i, '');
    if (this.safeEqualString(receivedBase64, expectedBase64)) {
      return true;
    }

    return false;
  }

  private safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
      return false;
    }
  }

  private safeEqualString(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
      return false;
    }
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
