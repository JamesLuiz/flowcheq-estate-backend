import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export type YouverifyVerifyResult = {
  reference: string;
  verified: boolean;
  customerId?: string;
  message: string;
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

  private headers() {
    return {
      token: this.apiKey!,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Verify NIN or driver's license with selfie via YouVerify eIDV API.
   * @see https://doc.youverify.co/know-your-customer-services-kyc/id-data-matching-eidv/nigeria
   */
  async verifyIdentityWithSelfie(input: {
    userId: string;
    role: string;
    documentType: 'nin' | 'driver_license';
    idNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    selfieUrl: string;
  }): Promise<YouverifyVerifyResult> {
    const reference = `HM-${input.userId}-${Date.now()}`;

    if (!this.isConfigured) {
      this.logger.warn('YOVERIFY_API_KEY not set — mock verification only');
      return {
        reference,
        verified: false,
        message: 'YouVerify is not configured on the server (YOVERIFY_API_KEY missing).',
      };
    }

    const path =
      input.documentType === 'nin'
        ? '/v2/api/identity/ng/nin'
        : '/v2/api/identity/ng/drivers-license';

    const body: Record<string, unknown> = {
      id: input.idNumber.trim(),
      isSubjectConsent: true,
      metadata: {
        requestId: reference,
        userId: input.userId,
        role: input.role,
        product: 'flowcheq-estate-account-kyc',
      },
      validations: {
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
        },
        selfie: {
          image: input.selfieUrl,
        },
      },
    };

    if (input.documentType === 'nin') {
      body.premiumNin = true;
    }

    try {
      const response = await axios.post(`${this.baseUrl}${path}`, body, {
        headers: this.headers(),
        timeout: 60000,
      });

      const data = (response.data?.data ?? response.data) as Record<string, unknown>;
      const validations = data.validations as Record<string, unknown> | undefined;
      const selfieBlock = validations?.selfie as Record<string, unknown> | undefined;
      const selfieVerification = selfieBlock?.selfieVerification as
        | { match?: boolean }
        | undefined;

      const status = String(data.status ?? '').toLowerCase();
      const selfieMatch = selfieVerification?.match === true;
      const allPassed =
        data.allValidationPassed === true ||
        (status === 'found' && selfieMatch && data.selfieValidation === true);

      const validationMessages = String(validations?.validationMessages ?? '').trim();
      const reason = String(data.reason ?? '').trim();

      return {
        reference,
        verified: allPassed,
        customerId: (data.id as string | undefined) ?? (data.idNumber as string | undefined),
        message: allPassed
          ? 'Identity verified successfully via YouVerify.'
          : validationMessages ||
            reason ||
            'Verification did not pass. Check your ID details and selfie, then try again.',
        raw: data,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const payload = error.response?.data as Record<string, unknown> | undefined;
        const message =
          (typeof payload?.message === 'string' && payload.message) ||
          error.message ||
          'YouVerify request failed';

        if (status === 402) {
          throw new HttpException(
            'YouVerify verification fee could not be processed (insufficient wallet balance). Contact support.',
            HttpStatus.PAYMENT_REQUIRED,
          );
        }

        this.logger.error(`YouVerify verify failed (${status}): ${message}`);
        throw new HttpException(message, status ?? HttpStatus.BAD_GATEWAY);
      }

      this.logger.error(`YouVerify verify failed: ${String(error)}`);
      throw error;
    }
  }

  /**
   * @deprecated Use verifyIdentityWithSelfie. Kept for backward compatibility.
   */
  async initiateIdentityVerification(input: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: string;
  }): Promise<{ reference: string; status: string; checkoutUrl?: string }> {
    return {
      reference: `HM-${input.userId}-${Date.now()}`,
      status: 'use_verify_endpoint',
      checkoutUrl: undefined,
    };
  }

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
    const event = String(body.event ?? '').toLowerCase();
    const data = (body.data ?? body) as Record<string, unknown>;
    const metadata = (data.metadata ?? body.metadata) as Record<string, unknown> | undefined;

    const reference =
      (metadata?.requestId as string | undefined) ||
      (body.reference as string | undefined) ||
      (data.reference as string | undefined);

    const statusRaw = String(
      data.status ?? body.status ?? body.verificationStatus ?? '',
    ).toLowerCase();

    const allPassed = data.allValidationPassed === true;
    const verified =
      event === 'identity.completed' ||
      allPassed ||
      ['verified', 'approved', 'success', 'completed', 'found'].includes(statusRaw);
    const failed = ['failed', 'rejected', 'declined', 'not_found'].includes(statusRaw);

    return {
      reference,
      customerId: (data.id ?? data.customerId ?? body.customerId) as string | undefined,
      status: verified && !failed ? 'verified' : failed ? 'failed' : 'pending',
    };
  }
}
