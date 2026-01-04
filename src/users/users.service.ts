import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAgentProfileDto } from './dto/update-agent-profile.dto';
import { User, UserDocument, UserRole } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(payload: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel
      .findOne({ email: payload.email.toLowerCase() })
      .lean()
      .exec();

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const createdUser = new this.userModel({
      ...payload,
      email: payload.email.toLowerCase(),
      role: payload.role ?? UserRole.User,
    });

    return createdUser.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async updateAgentProfile(
    id: string,
    payload: UpdateAgentProfileDto,
  ) {
    const updated = await this.userModel
      .findOneAndUpdate(
        { _id: id, role: { $in: [UserRole.Agent, UserRole.Landlord] } },
        { $set: payload },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Agent or landlord not found');
    }

    return this.toSafeUser(updated);
  }

  async addToWalletBalance(userId: string, amount: number) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = (user as any).walletBalance || 0;
    const newBalance = currentBalance + amount;

    await this.userModel.findByIdAndUpdate(userId, {
      $set: { walletBalance: newBalance },
    }).exec();

    return newBalance;
  }

  async deductFromWalletBalance(userId: string, amount: number) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = (user as any).walletBalance || 0;
    if (currentBalance < amount) {
      throw new Error('Insufficient wallet balance');
    }

    const newBalance = currentBalance - amount;

    await this.userModel.findByIdAndUpdate(userId, {
      $set: { walletBalance: newBalance },
    }).exec();

    return newBalance;
  }

  async findAgents(
    filter: FilterQuery<UserDocument> = {},
    options: { limit?: number } = {},
  ): Promise<UserDocument[]> {
    let query = this.userModel
      .find({ role: UserRole.Agent, ...filter })
      .sort({ createdAt: -1 });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.exec();
  }

  async setResetToken(email: string, resetToken: string, resetTokenExpiry: Date) {
    await this.userModel
      .updateOne(
        { email: email.toLowerCase() },
        { $set: { resetToken, resetTokenExpiry } },
      )
      .exec();
  }

  async findByResetToken(token: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        resetToken: token,
        resetTokenExpiry: { $gt: new Date() },
      })
      .exec();
  }

  async updatePassword(userId: string, hashedPassword: string) {
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: { password: hashedPassword },
          $unset: { resetToken: '', resetTokenExpiry: '' },
        },
      )
      .exec();
  }

  async delete(id: string): Promise<void> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.userModel.findByIdAndDelete(id).exec();
  }

  toSafeUser(user: UserDocument) {
    const plain = user.toObject();
    const { password, __v, _id, resetToken, resetTokenExpiry, ...rest } = plain as any;
    return {
      id: _id?.toString() ?? user.id,
      ...rest,
    };
  }
}
