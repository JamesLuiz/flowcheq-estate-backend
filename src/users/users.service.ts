import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAgentProfileDto } from './dto/update-agent-profile.dto';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { Withdrawal, WithdrawalDocument } from './schemas/withdrawal.schema';
import { Earning, EarningDocument } from './schemas/earning.schema';
import { EmailService } from '../auth/email.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Withdrawal.name)
    private readonly withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(Earning.name)
    private readonly earningModel: Model<EarningDocument>,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
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

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().exec();
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

  async updateBankAccount(
    userId: string,
    bankAccount: { bankName: string; accountNumber: string; accountName: string; bankCode: string },
  ) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { bankAccount } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    // Note: Split payment subaccount will be created automatically when payment is initialized
    // if it doesn't exist. This avoids circular dependency issues here.

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

  async updateWalletBalance(userId: string, balance: number) {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { walletBalance: balance },
    }).exec();
    return balance;
  }

  async findAgents(
    filter: FilterQuery<UserDocument> = {},
    options: { limit?: number } = {},
  ): Promise<UserDocument[]> {
    // If filter doesn't specify role, default to both agent and landlord
    const roleFilter = filter.role 
      ? filter.role 
      : { $in: [UserRole.Agent, UserRole.Landlord] };
    
    // Remove role from filter to avoid duplication, then add our role filter
    const { role, ...restFilter } = filter;
    
    let query = this.userModel
      .find({ role: roleFilter, ...restFilter })
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

  // Withdrawal methods
  async createWithdrawal(data: {
    userId: string;
    amount: number;
    bankName: string;
    accountNumber: string;
    accountName: string;
    bankCode: string;
    reference: string;
    transferId?: string;
    status?: string;
  }) {
    const withdrawal = new this.withdrawalModel({
      ...data,
      userId: new Types.ObjectId(data.userId),
      status: data.status || 'pending',
    });
    return withdrawal.save();
  }

  async getWithdrawals(userId: string) {
    return this.withdrawalModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateWithdrawalStatus(reference: string, status: string, failureReason?: string) {
    const update: any = { status };
    if (failureReason) update.failureReason = failureReason;
    if (status === 'successful') update.completedAt = new Date();
    
    return this.withdrawalModel.findOneAndUpdate(
      { reference },
      { $set: update },
      { new: true },
    ).exec();
  }

  // Earning methods
  async createEarning(data: {
    userId: string;
    amount: number;
    grossAmount: number;
    platformFee: number;
    type: string;
    description?: string;
    viewingId?: string;
    houseId?: string;
    propertyTitle?: string;
    clientName?: string;
  }) {
    const earning = new this.earningModel({
      ...data,
      userId: new Types.ObjectId(data.userId),
      viewingId: data.viewingId ? new Types.ObjectId(data.viewingId) : undefined,
      houseId: data.houseId ? new Types.ObjectId(data.houseId) : undefined,
    });
    return earning.save();
  }

  async getEarnings(userId: string) {
    return this.earningModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getEarningsStats(userId: string) {
    const earnings = await this.earningModel
      .find({ userId: new Types.ObjectId(userId) })
      .exec();

    const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
    const totalGross = earnings.reduce((sum, e) => sum + e.grossAmount, 0);
    const totalPlatformFees = earnings.reduce((sum, e) => sum + (e.grossAmount - e.amount), 0);

    return {
      totalEarnings,
      totalGross,
      totalPlatformFees,
      transactionCount: earnings.length,
    };
  }

  // Transaction PIN methods
  async setTransactionPin(userId: string, pin: string) {
    // Validate PIN is 6 digits
    if (!/^\d{6}$/.test(pin)) {
      throw new BadRequestException('Transaction PIN must be exactly 6 digits');
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { transactionPin: hashedPin },
    }).exec();

    return { success: true, message: 'Transaction PIN set successfully' };
  }

  async verifyTransactionPin(userId: string, pin: string): Promise<{ valid: boolean; attemptsRemaining: number }> {
    const user = await this.userModel.findById(userId).select('+transactionPin +transactionPinAttempts +transactionPinLockedUntil').exec();
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const transactionPin = (user as any).transactionPin;
    if (!transactionPin) {
      throw new UnauthorizedException('Transaction PIN not set. Please set your transaction PIN first.');
    }

    // Check if PIN is locked
    const lockedUntil = (user as any).transactionPinLockedUntil;
    if (lockedUntil && new Date(lockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`PIN is locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`);
    }

    // Verify PIN
    const isValid = await bcrypt.compare(pin, transactionPin);
    
    if (isValid) {
      // Reset attempts on successful verification
      await this.userModel.findByIdAndUpdate(userId, {
        $set: { transactionPinAttempts: 0 },
        $unset: { transactionPinLockedUntil: '' },
      }).exec();
      return { valid: true, attemptsRemaining: 3 };
    } else {
      // Increment failed attempts
      const currentAttempts = ((user as any).transactionPinAttempts || 0) + 1;
      const attemptsRemaining = Math.max(0, 3 - currentAttempts);
      
      if (currentAttempts >= 3) {
        // Lock PIN for 30 minutes
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + 30);
        await this.userModel.findByIdAndUpdate(userId, {
          $set: { 
            transactionPinAttempts: currentAttempts,
            transactionPinLockedUntil: lockUntil,
          },
        }).exec();
        throw new UnauthorizedException('Too many failed attempts. PIN is locked for 30 minutes.');
      } else {
        await this.userModel.findByIdAndUpdate(userId, {
          $set: { transactionPinAttempts: currentAttempts },
        }).exec();
        return { valid: false, attemptsRemaining };
      }
    }
  }

  async hasTransactionPin(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('+transactionPin').exec();
    return !!(user && (user as any).transactionPin);
  }

  async requestTransactionPinReset(userId: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpiry = new Date();
    resetExpiry.setMinutes(resetExpiry.getMinutes() + 15); // Code expires in 15 minutes

    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        transactionPinResetCode: resetCode,
        transactionPinResetExpiry: resetExpiry,
      },
    }).exec();

    // Send email with reset code
    try {
      await this.emailService.sendTransactionPinResetEmail(user.email, resetCode, user.name);
    } catch (error) {
      // Log error but don't fail the request
      console.error('Failed to send transaction PIN reset email:', error);
    }

    return {
      success: true,
      message: 'Reset code sent to your email',
    };
  }

  async resetTransactionPinWithCode(userId: string, code: string, newPin: string): Promise<{ success: boolean; message: string }> {
    // Validate new PIN
    if (!/^\d{6}$/.test(newPin)) {
      throw new BadRequestException('Transaction PIN must be exactly 6 digits');
    }

    const user = await this.userModel.findById(userId).select('+transactionPinResetCode +transactionPinResetExpiry').exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const resetCode = (user as any).transactionPinResetCode;
    const resetExpiry = (user as any).transactionPinResetExpiry;

    if (!resetCode || !resetExpiry) {
      throw new BadRequestException('No reset code found. Please request a new one.');
    }

    if (new Date(resetExpiry) < new Date()) {
      throw new BadRequestException('Reset code has expired. Please request a new one.');
    }

    if (resetCode !== code) {
      throw new BadRequestException('Invalid reset code.');
    }

    // Hash and set new PIN
    const hashedPin = await bcrypt.hash(newPin, 10);
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { transactionPin: hashedPin },
      $unset: {
        transactionPinResetCode: '',
        transactionPinResetExpiry: '',
        transactionPinAttempts: '',
        transactionPinLockedUntil: '',
      },
    }).exec();

    return {
      success: true,
      message: 'Transaction PIN reset successfully',
    };
  }

  // Withdrawal OTP methods
  async generateWithdrawalOtp(userId: string): Promise<{ otp: string; expiresAt: Date }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate 6-character alphanumeric OTP
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let otp = '';
    for (let i = 0; i < 6; i++) {
      otp += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + 110); // 1:50s = 110 seconds

    // Store OTP (hashed for security)
    const hashedOtp = await bcrypt.hash(otp, 10);
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        withdrawalOtp: hashedOtp,
        withdrawalOtpExpiry: expiresAt,
      },
    }).exec();

    // Send OTP via email
    try {
      await this.emailService.sendWithdrawalOtpEmail(user.email, otp, user.name);
    } catch (error) {
      console.error('Failed to send withdrawal OTP email:', error);
      // Don't fail the request if email fails
    }

    return { otp, expiresAt };
  }

  async verifyWithdrawalOtp(userId: string, otp: string): Promise<{ valid: boolean; message?: string }> {
    const user = await this.userModel.findById(userId).select('+withdrawalOtp +withdrawalOtpExpiry').exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const storedOtp = (user as any).withdrawalOtp;
    const otpExpiry = (user as any).withdrawalOtpExpiry;

    if (!storedOtp || !otpExpiry) {
      return { valid: false, message: 'No OTP found. Please request a new one.' };
    }

    if (new Date(otpExpiry) < new Date()) {
      // Clear expired OTP
      await this.userModel.findByIdAndUpdate(userId, {
        $unset: { withdrawalOtp: '', withdrawalOtpExpiry: '' },
      }).exec();
      return { valid: false, message: 'OTP has expired. Please request a new one.' };
    }

    const isValid = await bcrypt.compare(otp, storedOtp);
    
    if (isValid) {
      // Clear OTP after successful verification
      await this.userModel.findByIdAndUpdate(userId, {
        $unset: { withdrawalOtp: '', withdrawalOtpExpiry: '' },
      }).exec();
      return { valid: true };
    } else {
      return { valid: false, message: 'Invalid OTP.' };
    }
  }

  // ============ PENDING DISBURSEMENTS ============

  async getPendingDisbursements() {
    // Get all agents/landlords with positive wallet balance but no virtual account setup
    // These are agents who need manual disbursement
  // Note: we avoid importing Flutterwave service here to prevent circular deps; we only inspect wallets directly
    const agents = await this.userModel.find({
      role: { $in: ['agent', 'landlord'] },
      walletBalance: { $gt: 0 },
    }).exec();

    const pendingDisbursements: any[] = [];

    for (const agent of agents) {
      // Check if agent has a virtual account with subaccountId (split payments work)
      // We need to check their wallet - import FlutterwaveService would cause circular dep
      // So we'll check based on whether they have a bank account set up
      const hasVirtualAccountSetup = false; // Will be determined by checking wallet model directly
      
      // Get their earnings for context
      const earnings = await this.earningModel.find({ 
        userId: agent._id,
      }).sort({ createdAt: -1 }).limit(10).exec();

      const totalEarnings = await this.earningModel.aggregate([
        { $match: { userId: agent._id } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).exec();

      pendingDisbursements.push({
        agent: this.toSafeUser(agent),
        pendingAmount: agent.walletBalance || 0,
        totalEarnings: totalEarnings[0]?.total || 0,
        recentEarnings: earnings.map(e => ({
          id: e._id?.toString(),
          amount: e.amount,
          type: e.type,
          description: e.description,
          createdAt: (e as any).createdAt,
        })),
        hasBankAccount: !!agent.bankAccount?.accountNumber,
        bankAccount: agent.bankAccount ? {
          bankName: agent.bankAccount.bankName,
          accountNumber: agent.bankAccount.accountNumber?.replace(/(\d{4})(\d+)(\d{4})/, '$1****$3'), // Mask middle digits
          accountName: agent.bankAccount.accountName,
        } : null,
        reason: !agent.bankAccount?.accountNumber 
          ? 'No bank account configured' 
          : 'Split payment not configured - requires manual transfer',
      });
    }

    return {
      data: pendingDisbursements.filter(d => d.pendingAmount > 0),
      totalPending: pendingDisbursements.reduce((sum, d) => sum + d.pendingAmount, 0),
      count: pendingDisbursements.filter(d => d.pendingAmount > 0).length,
    };
  }

  async processManualDisbursement(agentId: string, amount: number, reason?: string) {
    const agent = await this.userModel.findById(agentId).exec();
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (!agent.bankAccount?.accountNumber || !agent.bankAccount?.bankCode) {
      throw new BadRequestException('Agent does not have a valid bank account configured');
    }

    if ((agent.walletBalance ?? 0) < amount) {
      throw new BadRequestException(`Insufficient wallet balance. Available: ₦${(agent.walletBalance ?? 0).toLocaleString()}`);
    }

    // Create a withdrawal record
    const withdrawal = await this.withdrawalModel.create({
      userId: agent._id,
      amount,
      bankName: agent.bankAccount.bankName,
      accountNumber: agent.bankAccount.accountNumber,
      accountName: agent.bankAccount.accountName,
      status: 'pending',
      notes: `Admin manual disbursement${reason ? `: ${reason}` : ''}`,
    });

    // Deduct from wallet
    await this.userModel.findByIdAndUpdate(agentId, {
      $inc: { walletBalance: -amount },
    }).exec();

    // Send email notification
    try {
      // Use `any` to avoid TypeScript complaining if the optional processing email method doesn't exist
      const sendProcessing = (this.emailService as any).sendWithdrawalProcessingEmail;
      if (typeof sendProcessing === 'function') {
        await sendProcessing.call(this.emailService, agent.email, agent.name, amount, agent.bankAccount.bankName, agent.bankAccount.accountNumber);
      } else {
        // Fallback to the existing success email if a processing email isn't implemented
        await this.emailService.sendWithdrawalSuccessEmail(
          agent.email,
          agent.name,
          amount,
          agent.bankAccount.bankName,
          agent.bankAccount.accountNumber,
        );
      }
    } catch (error) {
      console.error('Failed to send disbursement email:', error);
    }

    return {
      success: true,
      message: `Manual disbursement of ₦${amount.toLocaleString()} initiated for ${agent.name}`,
      withdrawalId: withdrawal._id?.toString(),
      agent: this.toSafeUser(agent),
      amount,
    };
  }
}
