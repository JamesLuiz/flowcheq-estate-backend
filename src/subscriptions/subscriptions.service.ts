import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscription, SubscriptionDocument } from './schemas/subscription.schema';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  plans() {
    return [
      { tier: 'free', priceKobo: 0, listings: 1, features: ['Basic listing'] },
      { tier: 'basic', priceKobo: 500000, listings: 5, features: ['Priority verification', 'Enquiry tracker'] },
      { tier: 'pro', priceKobo: 1500000, listings: -1, features: ['Unlimited listings', 'Analytics', 'Priority support'] },
    ];
  }

  async current(landlordId: string) {
    return (
      (await this.subscriptionModel
        .findOne({ landlordId })
        .sort({ createdAt: -1 })
        .exec()) ?? null
    );
  }

  async subscribe(
    landlordId: string,
    payload: { tier: 'free' | 'basic' | 'pro'; billingCycle?: 'monthly' | 'annual' },
  ) {
    const now = new Date();
    const end = new Date(now);
    if ((payload.billingCycle ?? 'monthly') === 'annual') {
      end.setFullYear(end.getFullYear() + 1);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    return this.subscriptionModel.create({
      landlordId,
      tier: payload.tier,
      status: 'active',
      billingCycle: payload.billingCycle ?? 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: end,
      paymentReference: `SUB-${Date.now()}-${landlordId}`,
      autoRenew: true,
    });
  }

  async webhook(payload: any) {
    if (!payload?.paymentReference) {
      return { success: true, ignored: true };
    }
    const sub = await this.subscriptionModel.findOne({ paymentReference: payload.paymentReference });
    if (!sub) {
      return { success: true, ignored: true };
    }
    if (payload.status === 'failed') {
      sub.status = 'past_due';
    } else if (payload.status === 'successful') {
      sub.status = 'active';
    }
    await sub.save();
    return { success: true };
  }

  async cancel(landlordId: string, reason?: string) {
    const sub = await this.subscriptionModel
      .findOne({ landlordId, status: 'active' })
      .sort({ createdAt: -1 })
      .exec();
    if (!sub) {
      throw new NotFoundException('Active subscription not found');
    }
    sub.status = 'cancelled';
    sub.cancelledAt = new Date();
    sub.cancelReason = reason ?? undefined;
    sub.autoRenew = false;
    await sub.save();
    return sub;
  }

  async invoices(landlordId: string) {
    const list = await this.subscriptionModel.find({ landlordId }).sort({ createdAt: -1 });
    return {
      invoices: list.map((s) => ({
        id: s._id.toString(),
        tier: s.tier,
        status: s.status,
        billingCycle: s.billingCycle,
        periodStart: s.currentPeriodStart,
        periodEnd: s.currentPeriodEnd,
        paymentReference: s.paymentReference ?? null,
      })),
    };
  }

  async adminOverview() {
    const all = await this.subscriptionModel.find();
    const active = all.filter((s) => s.status === 'active');
    const mrr = active.reduce((sum, s) => {
      if (s.tier === 'basic') return sum + 500000;
      if (s.tier === 'pro') return sum + 1500000;
      return sum;
    }, 0);
    return {
      totalSubscriptions: all.length,
      activeSubscriptions: active.length,
      mrrKobo: mrr,
      subscriptions: all,
    };
  }
}
