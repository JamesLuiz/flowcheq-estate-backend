import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AreaRentIndexSnapshot,
  AreaRentIndexSnapshotDocument,
} from './schemas/area-rent-index.schema';

@Injectable()
export class AreaRentIndexService {
  constructor(
    @InjectModel(AreaRentIndexSnapshot.name)
    private readonly ariModel: Model<AreaRentIndexSnapshotDocument>,
  ) {}

  async getDistrict(district: string) {
    return this.ariModel.find({ district }).sort({ computedAt: -1 });
  }

  async getSpecific(district: string, type: string, bedrooms: number) {
    return this.ariModel.findOne({ district, propertyType: type, bedrooms }).sort({ computedAt: -1 });
  }

  async compare(districts: string[]) {
    return this.ariModel.find({ district: { $in: districts } }).sort({ computedAt: -1 });
  }

  async recompute() {
    const now = new Date();
    const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const snapshot = await this.ariModel.create({
      district: 'yaba',
      city: 'lagos',
      state: 'lagos',
      propertyType: 'flat',
      bedrooms: 2,
      p25Rent: 14000000,
      medianRent: 18000000,
      p75Rent: 24000000,
      sampleSize: 1,
      trendVs6Months: 0,
      computedAt: now,
      validUntil,
    });
    return { success: true, snapshot };
  }

  async publicDashboard() {
    return this.ariModel.find().sort({ computedAt: -1 }).limit(100);
  }
}
