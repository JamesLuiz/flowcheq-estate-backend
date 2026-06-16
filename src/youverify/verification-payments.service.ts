import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import {
  VerificationPayment,
  VerificationPaymentDocument,
  VerificationPaymentStatus,
} from './schemas/verification-payment.schema';

const SDK_UNLOCKED_STATUSES: VerificationPaymentStatus[] = [
  'ready',
  'youverify_pending',
  'failed',
  'verified',
];

@Injectable()
export class VerificationPaymentsService {
  private readonly logger = new Logger(VerificationPaymentsService.name);

  constructor(
    @InjectModel(VerificationPayment.name)
    private readonly paymentModel: Model<VerificationPaymentDocument>,
    private readonly configService: ConfigService,
  ) {}

  getVerificationFee(): number {
    const raw = this.configService.get<string>('YOVERIFY_VERIFICATION_FEE_NGN');
    const fee = raw != null ? Number(raw) : 1500;
    return Number.isFinite(fee) && fee > 0 ? fee : 1500;
  }

  async findLatestForUser(userId: string): Promise<VerificationPaymentDocument | null> {
    return this.paymentModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByCheckoutReference(reference: string): Promise<VerificationPaymentDocument | null> {
    return this.paymentModel.findOne({ flutterwaveReference: reference }).exec();
  }

  async getOrCreatePayment(userId: string): Promise<VerificationPaymentDocument> {
    const existing = await this.findLatestForUser(userId);
    if (existing && existing.status !== 'verified' && existing.status !== 'refunded') {
      return existing;
    }

    const feeAmount = this.getVerificationFee();
    return this.paymentModel.create({
      userId: new Types.ObjectId(userId),
      feeAmount,
      currency: 'NGN',
      status: 'awaiting_funding',
      events: [{ status: 'awaiting_funding', note: 'Awaiting verification fee checkout' }],
    });
  }

  private async appendEvent(
    payment: VerificationPaymentDocument,
    status: VerificationPaymentStatus,
    note?: string,
    meta?: Record<string, unknown>,
  ) {
    payment.status = status;
    payment.events.push({ status, note, meta, at: new Date() });
    await payment.save();
    return payment;
  }

  isVerificationFeePaid(payment: VerificationPaymentDocument | null): boolean {
    if (!payment) return false;
    return SDK_UNLOCKED_STATUSES.includes(payment.status);
  }

  async prepareCheckout(userId: string): Promise<{
    payment: VerificationPaymentDocument;
    txRef: string;
  }> {
    const payment = await this.getOrCreatePayment(userId);

    if (payment.status === 'verified') {
      throw new BadRequestException('Verification fee already paid and account verified');
    }

    if (this.isVerificationFeePaid(payment) && payment.flutterwaveReference) {
      return { payment, txRef: payment.flutterwaveReference };
    }

    const txRef = `VERIFY-FEE-${userId}-${Date.now()}`;
    payment.flutterwaveReference = txRef;
    await this.appendEvent(payment, 'awaiting_funding', 'Verification checkout initiated', {
      txRef,
      feeAmount: payment.feeAmount,
    });

    return { payment, txRef };
  }

  async markFeePaidFromCheckout(
    userId: string,
    txRef: string,
    amount: number,
  ): Promise<VerificationPaymentDocument> {
    let payment = await this.findByCheckoutReference(txRef);
    if (!payment) {
      payment = await this.getOrCreatePayment(userId);
      payment.flutterwaveReference = txRef;
    }

    if (payment.status === 'verified') {
      return payment;
    }

    const expected = payment.feeAmount || this.getVerificationFee();
    if (Math.abs(amount - expected) > 0.01) {
      this.logger.warn(`Verification fee amount mismatch for ${txRef}: got ${amount}, expected ${expected}`);
    }

    if (this.isVerificationFeePaid(payment)) {
      return payment;
    }

    return this.appendEvent(payment, 'ready', 'Verification fee paid via Flutterwave checkout', {
      txRef,
      amount,
    });
  }

  async markYouverifyPending(payment: VerificationPaymentDocument, youverifyReference?: string) {
    if (youverifyReference) payment.youverifyReference = youverifyReference;
    return this.appendEvent(payment, 'youverify_pending', 'YouVerify SDK session completed');
  }

  async markVerified(payment: VerificationPaymentDocument, youverifyReference?: string) {
    if (youverifyReference) payment.youverifyReference = youverifyReference;
    payment.completedAt = new Date();
    return this.appendEvent(payment, 'verified', 'Identity verified via YouVerify SDK');
  }

  async markFailed(payment: VerificationPaymentDocument, reason: string) {
    payment.failureReason = reason;
    return this.appendEvent(payment, 'failed', reason);
  }
}
