import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Promotion, PromotionDocument, PromotionStatus } from './schemas/promotion.schema';
import { HousesService } from '../houses/houses.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectModel(Promotion.name)
    private promotionModel: Model<PromotionDocument>,
    private readonly housesService: HousesService,
    private readonly usersService: UsersService,
  ) {}

  async create(userId: string, dto: any) {
    // Verify user owns the house
    const house = await this.housesService.findOne(dto.houseId);
    if (!house) {
      throw new NotFoundException('House not found');
    }

    if (house.agentId.toString() !== userId) {
      throw new ForbiddenException('You can only promote your own properties');
    }

    // Verify user is verified
    const user = await this.usersService.findById(userId);
    if (!user || !user.verified) {
      throw new ForbiddenException('You must be verified to promote properties');
    }

    // Calculate end date
    const startDate = new Date(dto.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + dto.days);

    const promotion = new this.promotionModel({
      houseId: dto.houseId,
      userId: userId,
      bannerImage: dto.bannerImage,
      startDate: startDate,
      endDate: endDate,
      days: dto.days,
      amount: dto.amount,
      paymentReference: dto.paymentReference,
      status: PromotionStatus.PENDING,
    });

    await promotion.save();
    return this.toPromotionResponse(promotion);
  }

  async findAll(filters?: { status?: PromotionStatus; userId?: string }) {
    const query: any = {};
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.userId) {
      query.userId = filters.userId;
    }

    const promotions = await this.promotionModel
      .find(query)
      .populate('houseId', 'title price location images agentId')
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .exec();

    return promotions.map((p) => this.toPromotionResponse(p));
  }

  async findActivePromotions() {
    const now = new Date();
    const promotions = await this.promotionModel
      .find({
        status: PromotionStatus.ACTIVE,
        startDate: { $lte: now },
        endDate: { $gte: now },
      })
      .populate('houseId', 'title price location images agentId')
      .populate({
        path: 'houseId',
        populate: {
          path: 'agentId',
          select: 'name phone email',
        },
      })
      .sort({ createdAt: -1 })
      .exec();

    return promotions.map((p) => this.toPromotionResponse(p));
  }

  async findOne(id: string) {
    const promotion = await this.promotionModel
      .findById(id)
      .populate('houseId')
      .populate('userId')
      .exec();

    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }

    return this.toPromotionResponse(promotion);
  }

  async activate(id: string) {
    const promotion = await this.promotionModel.findById(id);
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }

    promotion.status = PromotionStatus.ACTIVE;
    promotion.activatedAt = new Date();
    await promotion.save();

    // Mark house as featured
    await this.housesService.update(promotion.houseId.toString(), promotion.userId.toString(), {
      featured: true,
    });

    return this.toPromotionResponse(promotion);
  }

  async trackClick(id: string) {
    await this.promotionModel.findByIdAndUpdate(id, {
      $inc: { clicks: 1 },
    });
  }

  async expirePromotions() {
    const now = new Date();
    const expired = await this.promotionModel.updateMany(
      {
        status: PromotionStatus.ACTIVE,
        endDate: { $lt: now },
      },
      {
        $set: {
          status: PromotionStatus.EXPIRED,
          expiredAt: now,
        },
      },
    );

    // Unfeature houses with expired promotions
    const expiredPromotions = await this.promotionModel
      .find({
        status: PromotionStatus.EXPIRED,
        expiredAt: now,
      })
      .exec();

    for (const promo of expiredPromotions) {
      // Check if there are other active promotions for this house
      const activePromo = await this.promotionModel.findOne({
        houseId: promo.houseId,
        status: PromotionStatus.ACTIVE,
        endDate: { $gte: now },
      });

      if (!activePromo) {
        await this.housesService.update(promo.houseId.toString(), promo.userId.toString(), {
          featured: false,
        });
      }
    }

    return expired.modifiedCount;
  }

  async cancel(id: string, userId: string) {
    const promotion = await this.promotionModel.findById(id);
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }

    if (promotion.userId.toString() !== userId) {
      throw new ForbiddenException('You can only cancel your own promotions');
    }

    if (promotion.status === PromotionStatus.ACTIVE) {
      throw new BadRequestException('Cannot cancel an active promotion');
    }

    promotion.status = PromotionStatus.CANCELLED;
    await promotion.save();

    return this.toPromotionResponse(promotion);
  }

  async adminCancel(id: string) {
    const promotion = await this.promotionModel.findById(id);
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }

    promotion.status = PromotionStatus.CANCELLED;
    await promotion.save();

    // Unfeature the house
    const activePromo = await this.promotionModel.findOne({
      houseId: promotion.houseId,
      status: PromotionStatus.ACTIVE,
      _id: { $ne: promotion._id },
    });

    if (!activePromo) {
      await this.housesService.update(
        promotion.houseId.toString(), 
        promotion.userId.toString(), 
        { featured: false }
      );
    }

    return this.toPromotionResponse(promotion);
  }

  private toPromotionResponse(promotion: PromotionDocument) {
    const house = promotion.houseId as any;
    const user = promotion.userId as any;

    return {
      id: promotion._id.toString(),
      houseId: house?._id?.toString() || house?.id,
      house: house ? {
        id: house._id?.toString() || house.id,
        title: house.title,
        price: house.price,
        location: house.location,
        images: house.images,
        agentId: house.agentId?._id?.toString() || house.agentId,
        agent: house.agentId,
      } : null,
      userId: user?._id?.toString() || user?.id,
      bannerImage: promotion.bannerImage,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      days: promotion.days,
      amount: promotion.amount,
      paymentReference: promotion.paymentReference,
      status: promotion.status,
      clicks: promotion.clicks,
      activatedAt: promotion.activatedAt,
      expiredAt: promotion.expiredAt,
      createdAt: promotion.createdAt,
      updatedAt: promotion.updatedAt,
    };
  }
}

