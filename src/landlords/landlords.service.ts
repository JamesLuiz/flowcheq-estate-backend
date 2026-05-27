import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { HousesService } from '../houses/houses.service';

@Injectable()
export class LandlordsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly housesService: HousesService,
  ) {}

  async getProfile(userId: string) {
    const landlord = await this.usersService.findById(userId);
    if (!landlord) {
      throw new NotFoundException('Landlord not found');
    }
    return this.usersService.toSafeUser(landlord);
  }

  async updateProfile(userId: string, payload: Record<string, unknown>) {
    return this.usersService.updateUserProfile(userId, payload);
  }

  async getKycStatus(userId: string) {
    const landlord = await this.usersService.findById(userId);
    if (!landlord) {
      throw new NotFoundException('Landlord not found');
    }
    return {
      kycStatus: landlord.kycStatus ?? 'pending',
      kycSubmittedAt: landlord.kycSubmittedAt ?? null,
      kycReviewedAt: landlord.kycReviewedAt ?? null,
      kycRejectionReason: landlord.kycRejectionReason ?? null,
    };
  }

  async submitIndividualKyc(userId: string, payload: Record<string, unknown>) {
    return this.usersService.updateUserProfile(userId, {
      ...payload,
      kycStatus: 'pending',
      kycSubmittedAt: new Date(),
    });
  }

  async submitCompanyKyc(userId: string, payload: Record<string, unknown>) {
    return this.usersService.updateUserProfile(userId, {
      ...payload,
      kycStatus: 'pending',
      kycSubmittedAt: new Date(),
    });
  }

  async getDashboard(userId: string) {
    const stats = await this.housesService.getStats(userId);
    return {
      listings: stats.totalListings,
      views: stats.totalViews,
      enquiries: stats.inquiries,
    };
  }

  async getEnquiries(userId: string) {
    const listings = await this.housesService.findByAgent(userId);
    return {
      enquiries: listings.map((listing: any) => ({
        propertyId: listing.id,
        title: listing.title,
        enquiryCount: listing.whatsappClicks ?? 0,
      })),
    };
  }

  async setBankAccount(
    userId: string,
    bankAccount: {
      bankName: string;
      accountNumber: string;
      accountName: string;
      bankCode: string;
    },
  ) {
    return this.usersService.updateBankAccount(userId, bankAccount);
  }

  async getPublicProfile(id: string) {
    const landlord = await this.usersService.findById(id);
    if (!landlord) {
      throw new NotFoundException('Landlord not found');
    }
    return {
      id: landlord._id.toString(),
      displayName: landlord.name,
      profilePhoto: landlord.avatarUrl ?? null,
      verifiedLandlordBadge: landlord.kycStatus === 'approved',
      reviewScore: (landlord as any).reviewScore ?? 0,
      reviewCount: (landlord as any).reviewCount ?? 0,
    };
  }

  async getPublicListings(id: string) {
    const listings = await this.housesService.findByAgent(id);
    return { listings };
  }
}
