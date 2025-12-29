import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Alert, AlertDocument } from './schemas/alert.schema';
import { CreateAlertDto } from './dto/create-alert.dto';
import { HouseDocument } from '../houses/schemas/house.schema';

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert.name)
    private readonly alertModel: Model<AlertDocument>,
  ) {}

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async createAlert(
    userId: string,
    payload: CreateAlertDto,
  ): Promise<Alert> {
    if (
      payload.minPrice &&
      payload.maxPrice &&
      payload.minPrice > payload.maxPrice
    ) {
      throw new BadRequestException(
        'minPrice cannot be greater than maxPrice',
      );
    }

    const alertData: any = {
      ...payload,
      userId: new Types.ObjectId(userId),
    };

    // Add coordinates if lat and lng are provided
    if (payload.lat !== undefined && payload.lng !== undefined) {
      alertData.coordinates = {
        lat: payload.lat,
        lng: payload.lng,
      };
      if (payload.radius !== undefined) {
        alertData.radius = payload.radius;
      }
    }

    const alert = new this.alertModel(alertData);

    return alert.save();
  }

  async findByUser(userId: string): Promise<Alert[]> {
    return this.alertModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .populate('matches.houseId')
      .exec();
  }

  async deleteAlert(userId: string, alertId: string): Promise<void> {
    const result = await this.alertModel
      .deleteOne({
        _id: new Types.ObjectId(alertId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!result.deletedCount) {
      throw new NotFoundException('Alert not found');
    }
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async handleHouseCreated(house: HouseDocument): Promise<void> {
    const andConditions: FilterQuery<AlertDocument>[] = [
      {
        $or: [
          { minPrice: { $exists: false } },
          { minPrice: { $lte: house.price } },
        ],
      },
      {
        $or: [
          { maxPrice: { $exists: false } },
          { maxPrice: { $gte: house.price } },
        ],
      },
    ];

    if (house.location) {
      andConditions.push({
        $or: [
          { location: { $exists: false } },
          {
            location: {
              $regex: new RegExp(
                `^${this.escapeRegex(house.location)}$`,
                'i',
              ),
            },
          },
        ],
      });
    }

    if (house.type) {
      andConditions.push({
        $or: [
          { type: { $exists: false } },
          {
            type: {
              $regex: new RegExp(`^${this.escapeRegex(house.type)}$`, 'i'),
            },
          },
        ],
      });
    }

    const conditions: FilterQuery<AlertDocument> = { $and: andConditions };

    let matchingAlerts = await this.alertModel.find(conditions).lean().exec();

    // Filter by location if both alert and house have coordinates
    if (house.coordinates && house.coordinates.lat && house.coordinates.lng) {
      const houseLat = house.coordinates.lat;
      const houseLng = house.coordinates.lng;
      
      matchingAlerts = matchingAlerts.filter((alert: any) => {
        if (!alert.coordinates || !alert.coordinates.lat || !alert.coordinates.lng) {
          // If alert doesn't have coordinates, use location string matching (already done above)
          return true;
        }

        const radius = alert.radius || 20; // Default 20km
        const distance = this.calculateDistance(
          alert.coordinates.lat,
          alert.coordinates.lng,
          houseLat,
          houseLng,
        );

        return distance <= radius;
      });
    }

    if (!matchingAlerts.length) {
      return;
    }

    const now = new Date();

    await Promise.all(
      matchingAlerts.map((alert) =>
        this.alertModel
          .updateOne(
            { _id: alert._id },
            {
              $push: {
                matches: {
                  houseId: house._id,
                  matchedAt: now,
                },
              },
              $set: { lastNotifiedAt: now },
            },
          )
          .exec(),
      ),
    );
  }
}
