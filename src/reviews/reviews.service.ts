import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    private readonly usersService: UsersService,
  ) {}

  async create(userId: string, agentId: string, dto: CreateReviewDto) {
    // Check if agent exists and is an agent or landlord
    const agent = await this.usersService.findById(agentId);
    if (!agent || (agent.role !== UserRole.Agent && agent.role !== UserRole.Landlord)) {
      throw new NotFoundException('Agent or landlord not found');
    }

    // Check if user already reviewed this agent
    const existingReview = await this.reviewModel
      .findOne({
        agentId: new Types.ObjectId(agentId),
        userId: new Types.ObjectId(userId),
        deleted: { $ne: true },
      })
      .exec();

    if (existingReview) {
      throw new ConflictException('You have already reviewed this agent');
    }

    const review = new this.reviewModel({
      ...dto,
      agentId: new Types.ObjectId(agentId),
      userId: new Types.ObjectId(userId),
    });

    const savedReview = await review.save();
    await savedReview.populate('userId', 'name email avatarUrl');

    return this.toReviewResponse(savedReview);
  }

  async findByAgent(agentId: string) {
    const reviews = await this.reviewModel
      .find({
        agentId: new Types.ObjectId(agentId),
        deleted: { $ne: true },
      })
      .populate('userId', 'name email avatarUrl')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const reviewsList = reviews.map((review) => this.toReviewResponse(review));

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    return {
      reviews: reviewsList,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews: reviews.length,
    };
  }

  async update(reviewId: string, userId: string, dto: Partial<CreateReviewDto>) {
    const review = await this.reviewModel
      .findOne({
        _id: new Types.ObjectId(reviewId),
        userId: new Types.ObjectId(userId),
        deleted: { $ne: true },
      })
      .exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.reviewModel
      .findByIdAndUpdate(new Types.ObjectId(reviewId), { $set: dto }, { new: true })
      .populate('userId', 'name email avatarUrl')
      .exec();

    return this.toReviewResponse(updated!);
  }

  async remove(reviewId: string, userId: string) {
    const review = await this.reviewModel
      .findOne({
        _id: new Types.ObjectId(reviewId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.reviewModel
      .findByIdAndUpdate(new Types.ObjectId(reviewId), { $set: { deleted: true } })
      .exec();
  }

  private toReviewResponse(review: ReviewDocument | any) {
    const plain = 'toObject' in review ? review.toObject() : review;
    const { _id, __v, agentId, userId, ...rest } = plain as any;

    return {
      id: (_id ?? review.id)?.toString(),
      ...rest,
      user: userId && typeof userId === 'object' ? {
        id: userId._id?.toString() || userId.id,
        name: userId.name,
        email: userId.email,
        avatarUrl: userId.avatarUrl,
      } : undefined,
    };
  }
}

