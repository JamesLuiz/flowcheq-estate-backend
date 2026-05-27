import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { House, HouseDocument } from '../houses/schemas/house.schema';
import { HousesService } from '../houses/houses.service';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectModel(House.name) private readonly houseModel: Model<HouseDocument>,
    private readonly housesService: HousesService,
  ) {}

  create(landlordId: string, payload: any) {
    return this.housesService.create(landlordId, payload);
  }

  findAll(filters: any) {
    return this.housesService.findAll(filters);
  }

  findOne(id: string) {
    return this.housesService.findOne(id, true);
  }

  update(id: string, landlordId: string, payload: any) {
    return this.housesService.update(id, landlordId, payload);
  }

  async archive(id: string, landlordId: string) {
    await this.housesService.remove(id, landlordId);
    await this.houseModel.findByIdAndUpdate(id, {
      $set: { status: 'archived', archivedAt: new Date() },
    });
    return { success: true };
  }

  async pause(id: string, landlordId: string) {
    const updated = await this.houseModel.findOneAndUpdate(
      { _id: id, agentId: landlordId },
      { $set: { status: 'paused' } },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Property not found');
    }
    return updated;
  }

  async activate(id: string, landlordId: string) {
    const updated = await this.houseModel.findOneAndUpdate(
      { _id: id, agentId: landlordId },
      { $set: { status: 'active' } },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Property not found');
    }
    return updated;
  }

  async markRented(id: string, landlordId: string) {
    const updated = await this.houseModel.findOneAndUpdate(
      { _id: id, agentId: landlordId },
      { $set: { status: 'rented' } },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Property not found');
    }
    return updated;
  }

  async myListings(landlordId: string) {
    const listings = await this.houseModel.find({ agentId: landlordId }).sort({ createdAt: -1 });
    return { data: listings };
  }

  async enquire(id: string, userId: string) {
    const updated = await this.houseModel.findByIdAndUpdate(
      id,
      { $addToSet: { enquiredByUsers: userId }, $set: { enquiryEnabled: true }, $inc: { whatsappClicks: 1 } },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Property not found');
    }
    return { success: true };
  }

  async contact(id: string, userId: string) {
    const property = await this.houseModel.findById(id).populate('agentId');
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    if (!property.enquiredByUsers?.includes(userId)) {
      throw new ForbiddenException('Enquiry required before revealing contact');
    }
    const owner = property.agentId as any;
    return { phone: owner?.phone ?? null };
  }

  async priceComparison(id: string) {
    const property = await this.houseModel.findById(id);
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    const areaMedianRent = property.annualRent ?? property.price ?? 0;
    const priceVsMedian = 0;
    return { areaMedianRent, priceVsMedian, priceAlert: false };
  }
}
