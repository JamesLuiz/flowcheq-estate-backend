import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Verification, VerificationDocument, VerificationStatus, DocumentType } from './schemas/verification.schema';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { CloudinaryService } from '../houses/cloudinary.service';
import { EmailService } from '../auth/email.service';

@Injectable()
export class VerificationsService {
  constructor(
    @InjectModel(Verification.name)
    private verificationModel: Model<VerificationDocument>,
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly emailService: EmailService,
  ) {}

  async uploadVerification(
    userId: string,
    documentType: DocumentType,
    documentFile: Express.Multer.File,
    selfieFile: Express.Multer.File,
  ) {
    // Check file sizes (max 1MB each)
    if (documentFile.size > 1024 * 1024) {
      throw new BadRequestException('Document file size must be less than 1MB');
    }
    if (selfieFile.size > 1024 * 1024) {
      throw new BadRequestException('Selfie file size must be less than 1MB');
    }

    // Get user to check role
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.Agent && user.role !== UserRole.Landlord) {
      throw new ForbiddenException('Only agents and landlords can submit verification documents');
    }

    // Check if user already has a pending verification
    const existingVerification = await this.verificationModel.findOne({
      userId: user._id,
      status: VerificationStatus.PENDING,
    });

    if (existingVerification) {
      throw new BadRequestException('You already have a pending verification. Please wait for review.');
    }

    // Upload document to Cloudinary
    const docFilename = `verification-doc-${userId}-${Date.now()}-${documentFile.originalname}`;
    const docUploadResult = await this.cloudinaryService.uploadVerificationDocument(
      documentFile.buffer,
      docFilename,
      user.role === UserRole.Agent ? 'agent' : 'landlord',
    );

    // Upload selfie to Cloudinary
    const selfieFilename = `verification-selfie-${userId}-${Date.now()}-${selfieFile.originalname}`;
    const selfieUploadResult = await this.cloudinaryService.uploadVerificationDocument(
      selfieFile.buffer,
      selfieFilename,
      user.role === UserRole.Agent ? 'agent' : 'landlord',
    );

    // Create verification record
    const verification = new this.verificationModel({
      userId: user._id,
      documentType,
      documentUrl: docUploadResult.url,
      cloudinaryPublicId: docUploadResult.publicId,
      selfieUrl: selfieUploadResult.url,
      selfiePublicId: selfieUploadResult.publicId,
      status: VerificationStatus.PENDING,
      nameMatches: false, // Will be checked by admin
    });

    await verification.save();

    // Update user verification status
    await this.usersService.updateAgentProfile(userId, {
      verificationStatus: 'pending',
    });

    return {
      id: verification._id.toString(),
      documentType: verification.documentType,
      documentUrl: verification.documentUrl,
      selfieUrl: verification.selfieUrl,
      status: verification.status,
      createdAt: verification.createdAt,
    };
  }

  async getAllVerifications(status?: VerificationStatus) {
    const query: any = {};
    if (status) {
      query.status = status;
    }

    const verifications = await this.verificationModel
      .find(query)
      .populate('userId', 'name email role phone')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .exec();

    return verifications.map((v) => ({
      id: v._id.toString(),
      userId: v.userId,
      documentType: v.documentType,
      documentUrl: v.documentUrl,
      selfieUrl: v.selfieUrl,
      status: v.status,
      rejectionReason: v.rejectionReason,
      adminMessage: v.adminMessage,
      nameMatches: v.nameMatches,
      documentName: v.documentName,
      reviewedAt: v.reviewedAt,
      reviewedBy: v.reviewedBy,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));
  }

  async getVerificationById(verificationId: string) {
    const verification = await this.verificationModel
      .findById(verificationId)
      .populate('userId', 'name email role phone')
      .populate('reviewedBy', 'name email')
      .exec();

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    return {
      id: verification._id.toString(),
      userId: verification.userId,
      documentType: verification.documentType,
      documentUrl: verification.documentUrl,
      selfieUrl: verification.selfieUrl,
      status: verification.status,
      rejectionReason: verification.rejectionReason,
      adminMessage: verification.adminMessage,
      nameMatches: verification.nameMatches,
      documentName: verification.documentName,
      reviewedAt: verification.reviewedAt,
      reviewedBy: verification.reviewedBy,
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt,
    };
  }

  async reviewVerification(
    verificationId: string,
    adminId: string,
    status: VerificationStatus,
    rejectionReason?: string,
    adminMessage?: string,
    nameMatches?: boolean,
    documentName?: string,
  ) {
    const verification = await this.verificationModel.findById(verificationId);
    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    const user = await this.usersService.findById(verification.userId.toString());
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (status === VerificationStatus.APPROVED) {
      // Approve verification
      verification.status = VerificationStatus.APPROVED;
      verification.reviewedAt = new Date();
      verification.reviewedBy = adminId as any;
      verification.nameMatches = nameMatches ?? true;
      if (documentName) {
        verification.documentName = documentName;
      }

      // Update user verification status
      await this.usersService.updateAgentProfile(verification.userId.toString(), {
        verified: true,
        verificationStatus: 'approved',
        verificationDate: new Date(),
      });

      // Send approval email
      await this.sendVerificationEmail(
        user.email,
        user.name,
        'approved',
        adminMessage || 'Your verification has been approved. You can now upload properties.',
      );
    } else if (status === VerificationStatus.REJECTED) {
      // Reject verification
      verification.status = VerificationStatus.REJECTED;
      verification.rejectionReason = rejectionReason || 'Document does not meet requirements';
      verification.adminMessage = adminMessage;
      verification.reviewedAt = new Date();
      verification.reviewedBy = adminId as any;
      if (documentName) {
        verification.documentName = documentName;
      }
      verification.nameMatches = nameMatches ?? false;

      // Delete documents from Cloudinary
      await this.cloudinaryService.deleteFromCloudinary(verification.cloudinaryPublicId);
      await this.cloudinaryService.deleteFromCloudinary(verification.selfiePublicId);

      // Update user verification status
      await this.usersService.updateAgentProfile(verification.userId.toString(), {
        verified: false,
        verificationStatus: 'rejected',
      });

      // Send rejection email
      await this.sendVerificationEmail(
        user.email,
        user.name,
        'rejected',
        adminMessage || `Your verification was rejected: ${rejectionReason || 'Document does not meet requirements'}`,
        rejectionReason,
      );
    }

    await verification.save();
    return this.getVerificationById(verificationId);
  }

  async deleteVerification(verificationId: string) {
    const verification = await this.verificationModel.findById(verificationId);
    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    // Delete from Cloudinary
    await this.cloudinaryService.deleteFromCloudinary(verification.cloudinaryPublicId);
    await this.cloudinaryService.deleteFromCloudinary(verification.selfiePublicId);

    // Delete from database
    await this.verificationModel.findByIdAndDelete(verificationId);

    return { success: true };
  }

  private async sendVerificationEmail(
    email: string,
    name: string,
    status: 'approved' | 'rejected',
    message: string,
    rejectionReason?: string,
  ) {
    await this.emailService.sendVerificationEmail(
      email,
      name,
      status,
      message,
      rejectionReason,
    );
  }

  async getUserVerification(userId: string) {
    const verification = await this.verificationModel
      .findOne({ userId })
      .sort({ createdAt: -1 })
      .exec();

    if (!verification) {
      return null;
    }

    return {
      id: verification._id.toString(),
      documentType: verification.documentType,
      documentUrl: verification.documentUrl,
      selfieUrl: verification.selfieUrl,
      status: verification.status,
      rejectionReason: verification.rejectionReason,
      adminMessage: verification.adminMessage,
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt,
    };
  }
}

