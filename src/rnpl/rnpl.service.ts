import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RnplApplication, RnplApplicationDocument } from './schemas/rnpl-application.schema';

@Injectable()
export class RnplService {
  constructor(
    @InjectModel(RnplApplication.name)
    private readonly rnplModel: Model<RnplApplicationDocument>,
  ) {}

  async checkEligibility(tenantId: string, payload: any) {
    const score = 70;
    const status = score >= 60 ? 'eligible' : 'ineligible';
    return this.rnplModel.create({
      tenantId,
      propertyId: payload.propertyId,
      landlordId: payload.landlordId,
      annualRentAmount: payload.annualRentAmount,
      requestedLoanAmount: payload.requestedLoanAmount,
      monoAccountId: payload.monoAccountId,
      monoVerifiedAt: new Date(),
      eligibilityStatus: status,
      eligibilityScore: score,
    });
  }

  async getEligibility(tenantId: string, propertyId: string) {
    return this.rnplModel.findOne({ tenantId, propertyId }).sort({ createdAt: -1 });
  }

  async apply(tenantId: string, applicationId: string) {
    const app = await this.rnplModel.findOne({ _id: applicationId, tenantId });
    if (!app) {
      throw new NotFoundException('RNPL application not found');
    }
    app.eligibilityStatus = 'pending_bank_review';
    app.bankLoanStatus = 'submitted';
    app.bankLoanReference = `RNPL-${Date.now()}-${applicationId}`;
    await app.save();
    return app;
  }

  listMine(tenantId: string) {
    return this.rnplModel.find({ tenantId }).sort({ createdAt: -1 });
  }

  async getMineById(tenantId: string, id: string) {
    const app = await this.rnplModel.findOne({ tenantId, _id: id });
    if (!app) {
      throw new NotFoundException('RNPL application not found');
    }
    return app;
  }

  async bankCallback(payload: any) {
    const app = await this.rnplModel.findOne({ bankLoanReference: payload.bankLoanReference });
    if (!app) {
      return { success: true, ignored: true };
    }
    app.bankLoanStatus = payload.status ?? app.bankLoanStatus;
    await app.save();
    return { success: true };
  }

  adminList() {
    return this.rnplModel.find().sort({ createdAt: -1 });
  }

  async referralFees() {
    const all = await this.rnplModel.find({ bankLoanStatus: { $in: ['approved', 'disbursed'] } });
    return {
      count: all.length,
      estimatedTotalReferralFees: all.reduce((sum, a) => sum + Math.round((a.requestedLoanAmount || 0) * 0.01), 0),
    };
  }
}
