import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { House, HouseDocument } from '../houses/schemas/house.schema';
import { ApproveCofoDto, RejectListingDto } from './dto/legal-review.dto';
import { EmailService } from '../auth/email.service';

@Injectable()
export class LegalReviewService {
  constructor(
    @InjectModel(House.name)
    private readonly houseModel: Model<HouseDocument>,
    private readonly emailService: EmailService,
  ) {}

  async listPending() {
    const houses = await this.houseModel
      .find({
        deleted: { $ne: true },
        $or: [
          { 'lawyerReview.status': 'pending' },
          { lawyerReview: { $exists: false }, verificationStatus: 'pending_verification' },
        ],
        ownershipDocuments: { $exists: true, $not: { $size: 0 } },
      })
      .populate('agentId', 'name email phone')
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return houses.map((h) => this.toSummary(h));
  }

  async getOne(houseId: string) {
    const house = await this.houseModel
      .findById(houseId)
      .populate('agentId', 'name email phone role')
      .lean()
      .exec();
    if (!house) throw new NotFoundException('Listing not found');
    return this.toDetail(house);
  }

  async approve(houseId: string, lawyerId: string, dto: ApproveCofoDto) {
    const cert = dto.certificateNumber.trim().toUpperCase();
    const duplicate = await this.houseModel
      .findOne({
        _id: { $ne: new Types.ObjectId(houseId) },
        'cofoDetails.certificateNumber': cert,
        verificationStatus: 'verified',
        deleted: { $ne: true },
      })
      .lean()
      .exec();

    if (duplicate) {
      throw new ConflictException(
        `Certificate ${cert} is already linked to a verified listing. Possible duplicate.`,
      );
    }

    const house = await this.houseModel
      .findByIdAndUpdate(
        houseId,
        {
          $set: {
            cofoDetails: {
              certificateNumber: cert,
              ownerName: dto.ownerName.trim(),
              plotNumber: dto.plotNumber?.trim(),
              surveyNumber: dto.surveyNumber?.trim(),
              location: dto.location?.trim(),
              issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
              registeredAt: dto.registeredAt?.trim(),
              lga: dto.lga?.trim(),
              state: dto.state?.trim(),
            },
            lawyerReview: {
              status: 'approved',
              reviewedBy: new Types.ObjectId(lawyerId),
              reviewedAt: new Date(),
              notes: dto.notes?.trim(),
            },
            verificationStatus: 'verified',
            addressVerified: true,
          },
        },
        { new: true },
      )
      .populate('agentId', 'name email')
      .exec();

    if (!house) throw new NotFoundException('Listing not found');

    const owner = house.agentId as unknown as { email?: string; name?: string };
    if (owner?.email) {
      await this.emailService.sendEmail({
        to: owner.email,
        subject: 'Your listing has been legally verified — Flowcheq Estate',
        html: `<p>Hello ${owner.name ?? 'there'},</p>
          <p>Our legal partners have verified your ownership documents. Your listing <strong>${house.title}</strong> is now live.</p>`,
      });
    }

    return this.toDetail(house.toObject() as unknown as Record<string, unknown>);
  }

  async reject(houseId: string, lawyerId: string, dto: RejectListingDto) {
    const house = await this.houseModel
      .findByIdAndUpdate(
        houseId,
        {
          $set: {
            lawyerReview: {
              status: 'rejected',
              reviewedBy: new Types.ObjectId(lawyerId),
              reviewedAt: new Date(),
              rejectionReason: dto.rejectionReason.trim(),
              notes: dto.notes?.trim(),
            },
            verificationStatus: 'rejected',
          },
        },
        { new: true },
      )
      .populate('agentId', 'name email')
      .exec();

    if (!house) throw new NotFoundException('Listing not found');

    const owner = house.agentId as unknown as { email?: string; name?: string };
    if (owner?.email) {
      await this.emailService.sendEmail({
        to: owner.email,
        subject: 'Listing verification update — Flowcheq Estate',
        html: `<p>Hello ${owner.name ?? 'there'},</p>
          <p>Your listing <strong>${house.title}</strong> could not be verified at this time.</p>
          <p>Reason: ${dto.rejectionReason}</p>`,
      });
    }

    return this.toDetail(house.toObject() as unknown as Record<string, unknown>);
  }

  async checkDuplicateCertificate(certificateNumber: string, excludeHouseId?: string) {
    const cert = certificateNumber.trim().toUpperCase();
    if (!cert) throw new BadRequestException('Certificate number required');

    const query: Record<string, unknown> = {
      'cofoDetails.certificateNumber': cert,
      verificationStatus: 'verified',
      deleted: { $ne: true },
    };
    if (excludeHouseId) query._id = { $ne: new Types.ObjectId(excludeHouseId) };

    const existing = await this.houseModel.findOne(query).select('title location').lean().exec();
    return { duplicate: Boolean(existing), existing: existing ?? null };
  }

  private toSummary(h: Record<string, unknown>) {
    const doc = h as {
      _id: Types.ObjectId;
      title: string;
      location: string;
      listingType?: string;
      verificationStatus?: string;
      lawyerReview?: House['lawyerReview'];
      ownershipDocuments?: House['ownershipDocuments'];
      agentId?: Record<string, unknown>;
      createdAt?: Date;
    };
    return {
      id: doc._id.toString(),
      title: doc.title,
      location: doc.location,
      listingType: doc.listingType,
      verificationStatus: doc.verificationStatus,
      lawyerReview: doc.lawyerReview,
      ownershipDocuments: doc.ownershipDocuments,
      createdAt: (doc as { createdAt?: Date }).createdAt,
      owner: doc.agentId,
    };
  }

  private toDetail(h: Record<string, unknown>) {
    const summary = this.toSummary(h);
    const doc = h as unknown as House & { description?: string; price?: number; images?: string[]; taggedPhotos?: House['taggedPhotos']; cofoDetails?: House['cofoDetails']; amenities?: string[] };
    return {
      ...summary,
      description: doc.description,
      price: doc.price,
      images: doc.images,
      taggedPhotos: doc.taggedPhotos,
      cofoDetails: doc.cofoDetails,
      amenities: doc.amenities,
    };
  }
}
