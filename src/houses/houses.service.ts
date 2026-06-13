import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { House, HouseDocument } from './schemas/house.schema';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { FilterHousesDto } from './dto/filter-houses.dto';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { AlertsService } from '../alerts/alerts.service';
import { EmailService } from '../auth/email.service';
import { PropertyManagementService } from '../property-management/property-management.service';
import {
  validateGpsPhotoMetadata,
  validateOwnershipDocuments,
  type TaggedPhotoInput,
} from './listing-validation.util';
import { INSPECTION_FEE_NGN } from '../common/listing-requirements';

const LISTING_OWNER_ROLES: UserRole[] = [
  UserRole.Landlord,
  UserRole.RealEstateCompany,
  UserRole.Company,
];

@Injectable()
export class HousesService {
  constructor(
    @InjectModel(House.name)
    private readonly houseModel: Model<HouseDocument>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly alertsService: AlertsService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => PropertyManagementService))
    private readonly propertyManagementService: PropertyManagementService,
  ) {}

  /**
   * Validates if a string is a valid MongoDB ObjectId
   * @param id - The ID string to validate
   * @throws BadRequestException if the ID is invalid
   */
  private validateObjectId(id: string, fieldName = 'ID'): void {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${fieldName} format`);
    }
  }

  async create(agentId: string, dto: CreateHouseDto) {
    const agent = await this.usersService.findById(agentId);

    if (!agent || !LISTING_OWNER_ROLES.includes(agent.role as UserRole)) {
      throw new ForbiddenException(
        'Only landlords and real estate companies can create listings. Agents must request management from the owner.',
      );
    }

    if (!agent.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email address before creating listings. Check your inbox for the verification link.',
      );
    }

    if (!agent.verified || agent.verificationStatus !== 'approved') {
      throw new ForbiddenException(
        'Complete landlord verification (NIN on profile, email verified, selfie approved) before listing properties.',
      );
    }

    const listingType = (dto.listingType === 'rent' ? 'rent' : 'buy') as 'rent' | 'buy';
    validateGpsPhotoMetadata(dto.taggedPhotos as any);
    validateOwnershipDocuments(listingType, dto.ownershipDocuments as any);

    const houseData: any = {
      ...dto,
      agentId: new Types.ObjectId(agentId),
      inspectionFeeAmount: INSPECTION_FEE_NGN,
      inspectionFeePaid: false,
      verificationStatus: 'pending_verification',
      lawyerReview: { status: 'pending' },
      gpsVerifiedPhotos: (dto.taggedPhotos ?? []).every(
        (p: any) => p.gpsVerified || (p.lat != null && p.lng != null),
      ),
    };

    if (dto.amenities?.length) {
      houseData.amenities = dto.amenities
        .map((a) => String(a).trim().toLowerCase())
        .filter(Boolean);
    }

    // If it's a shared property, initialize availableSlots
    if (dto.isShared && dto.totalSlots) {
      houseData.availableSlots = dto.totalSlots;
      houseData.bookedByUsers = [];
    } else {
      houseData.isShared = false;
      houseData.availableSlots = undefined;
      houseData.bookedByUsers = undefined;
    }

    const house = new this.houseModel(houseData);

    const savedHouse = await house.save();
    await savedHouse.populate('agentId');
    await this.alertsService.handleHouseCreated(savedHouse);

    return this.toHouseResponse(savedHouse);
  }

  async findAll(filters: FilterHousesDto) {
    const query: FilterQuery<HouseDocument> = {
      deleted: { $ne: true },
      flagged: { $ne: true },
      verificationStatus: 'verified',
      status: { $ne: 'archived' },
    };
    const escapeRegex = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (filters.minPrice !== undefined) {
        priceFilter.$gte = filters.minPrice;
      }
      if (filters.maxPrice !== undefined) {
        priceFilter.$lte = filters.maxPrice;
      }

      query.price = priceFilter as any;
    }

    if (filters.location) {
      query.location = new RegExp(escapeRegex(filters.location), 'i');
    }

    if (filters.type) {
      query.type = new RegExp(`^${escapeRegex(filters.type)}$`, 'i');
    }

    if (filters.featured !== undefined) {
      query.featured = filters.featured;
    }

    if (filters.agentId) {
      query.agentId = new Types.ObjectId(filters.agentId);
    }

    // Filter for shared properties
    if (filters.shared !== undefined) {
      query.isShared = filters.shared;
    }

    // Filter by listing type (rent or buy)
    if (filters.listingType) {
      query.listingType = filters.listingType;
    }

    if (filters.amenities?.length) {
      query.amenities = { $all: filters.amenities };
    }

    if (filters.search) {
      const searchRegex = new RegExp(escapeRegex(filters.search), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { location: searchRegex },
      ] as any;
    }

    const limit = filters.limit ?? 20;
    const skip = filters.skip ?? 0;

    let houseDocs = await this.houseModel
      .find(query)
      .populate('agentId')
      .lean()
      .exec();

    const hasGeo =
      filters.lat !== undefined &&
      filters.lng !== undefined &&
      !Number.isNaN(Number(filters.lat)) &&
      !Number.isNaN(Number(filters.lng));

    if (hasGeo) {
      const radiusKm = filters.radius ?? 10;
      houseDocs = houseDocs.filter((house: any) => {
        if (
          house.coordinates == null ||
          house.coordinates.lat == null ||
          house.coordinates.lng == null
        ) {
          return false;
        }
        const d = this.calculateDistance(
          filters.lat!,
          filters.lng!,
          house.coordinates.lat,
          house.coordinates.lng,
        );
        return d <= radiusKm;
      });
      houseDocs.sort((a: any, b: any) => {
        const distA = this.calculateDistance(
          filters.lat!,
          filters.lng!,
          a.coordinates.lat,
          a.coordinates.lng,
        );
        const distB = this.calculateDistance(
          filters.lat!,
          filters.lng!,
          b.coordinates.lat,
          b.coordinates.lng,
        );
        return distA - distB;
      });
    } else {
      houseDocs.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    }

    // Filter out properties from suspended/banned agents
    houseDocs = houseDocs.filter((house: any) => {
      const agent = house.agentId;
      if (!agent) return true;
      // Exclude if agent is suspended or banned
      if (agent.accountStatus === 'suspended' || agent.accountStatus === 'banned') {
        return false;
      }
      // Exclude if agent is suspended until a future date
      if (agent.suspendedUntil && new Date(agent.suspendedUntil) > new Date()) {
        return false;
      }
      return true;
    });

    // Apply pagination
    const total = houseDocs.length;
    const paginatedHouses = houseDocs.slice(skip, skip + limit);

    const houses = paginatedHouses.map((house) => this.toHouseResponse(house));

    return {
      data: houses,
      pagination: {
        total,
        limit,
        skip,
      },
    };
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

  async findOne(id: string, trackView = false) {
    this.validateObjectId(id, 'property ID');

    try {
    const house = await this.houseModel
      .findOne({
        _id: new Types.ObjectId(id),
        deleted: { $ne: true },
      })
      .populate('agentId')
      .exec();

    if (!house) {
      throw new NotFoundException('House not found');
    }

    if (trackView) {
      await this.trackView(id);
    }

    return this.toHouseResponse(house);
    } catch (error) {
      // Catch BSON errors and convert to BadRequestException
      if (error instanceof Error && error.name === 'BSONError') {
        throw new BadRequestException('Invalid property ID format');
      }
      // Re-throw other errors (like NotFoundException, BadRequestException)
      throw error;
    }
  }

  async trackView(id: string, viewerId?: string) {
    return this.propertyManagementService.recordPropertyView(id, viewerId);
  }

  async trackWhatsAppClick(id: string) {
    this.validateObjectId(id, 'property ID');
    try {
    await this.houseModel
      .findByIdAndUpdate(new Types.ObjectId(id), {
        $inc: { whatsappClicks: 1 },
      })
      .exec();
    return { success: true };
    } catch (error) {
      // Catch BSON errors silently for tracking (non-critical operation)
      if (error instanceof Error && error.name === 'BSONError') {
        return { success: false };
      }
      throw error;
    }
  }

  async update(
    houseId: string,
    agentId: string,
    dto: UpdateHouseDto,
  ) {
    await this.ensureAgentOwnsHouse(agentId, houseId);

    const house = await this.houseModel.findById(new Types.ObjectId(houseId)).exec();
    if (!house) {
      throw new NotFoundException('House not found');
    }

    // Handle shared property updates
    const updateData: any = { ...dto };

    if (dto.amenities !== undefined) {
      updateData.amenities = (dto.amenities ?? []).map((a) =>
        String(a).trim().toLowerCase(),
      ).filter(Boolean);
    }

    if (dto.isShared !== undefined) {
      if (dto.isShared && dto.totalSlots) {
        // If converting to shared or updating slots
        const currentBooked = house.bookedByUsers?.length || 0;
        const newTotalSlots = dto.totalSlots;
        
        // Ensure availableSlots doesn't exceed totalSlots
        if (currentBooked > newTotalSlots) {
          throw new ForbiddenException(`Cannot reduce slots below ${currentBooked} (currently booked)`);
        }
        
        updateData.availableSlots = newTotalSlots - currentBooked;
        updateData.totalSlots = newTotalSlots;
        
        // If not already shared, initialize bookedByUsers
        if (!house.isShared) {
          updateData.bookedByUsers = [];
        }
      } else if (!dto.isShared) {
        // Converting from shared to non-shared
        updateData.isShared = false;
        updateData.availableSlots = undefined;
        updateData.totalSlots = undefined;
        updateData.bookedByUsers = undefined;
      }
    } else if (house.isShared && dto.totalSlots !== undefined) {
      // Updating totalSlots for existing shared property
      const currentBooked = house.bookedByUsers?.length || 0;
      if (currentBooked > dto.totalSlots) {
        throw new ForbiddenException(`Cannot reduce slots below ${currentBooked} (currently booked)`);
      }
      updateData.availableSlots = dto.totalSlots - currentBooked;
      updateData.totalSlots = dto.totalSlots;
    }

    const updatedHouse = await this.houseModel
      .findByIdAndUpdate(
        new Types.ObjectId(houseId),
        { $set: updateData },
        { new: true },
      )
      .exec();

    if (!updatedHouse) {
      throw new NotFoundException('House not found');
    }

    await updatedHouse.populate('agentId');
    return this.toHouseResponse(updatedHouse);
  }

  async replaceGpsCapturedPhotos(
    houseId: string,
    agentId: string,
    taggedPhotos: TaggedPhotoInput[],
  ) {
    await this.ensureAgentOwnsHouse(agentId, houseId);

    const house = await this.houseModel.findById(new Types.ObjectId(houseId)).exec();
    if (!house) {
      throw new NotFoundException('House not found');
    }

    validateGpsPhotoMetadata(taggedPhotos);

    const imageUrls = taggedPhotos.map((p) => p.url);

    const updatedHouse = await this.houseModel
      .findByIdAndUpdate(
        new Types.ObjectId(houseId),
        {
          $set: {
            taggedPhotos,
            images: imageUrls,
            gpsVerifiedPhotos: taggedPhotos.every(
              (p) =>
                typeof p.lat === 'number' &&
                typeof p.lng === 'number' &&
                !Number.isNaN(p.lat) &&
                !Number.isNaN(p.lng),
            ),
          },
        },
        { new: true },
      )
      .exec();

    if (!updatedHouse) {
      throw new NotFoundException('House not found');
    }

    await updatedHouse.populate('agentId');
    return this.toHouseResponse(updatedHouse);
  }

  async updateViewingFee(houseId: string, agentId: string, viewingFee: number) {
    await this.ensureAgentOwnsHouse(agentId, houseId);

    const house = await this.houseModel.findById(new Types.ObjectId(houseId)).exec();
    if (!house) {
      throw new NotFoundException('House not found');
    }

    const updateData: any = {};
    if (viewingFee === 0 || viewingFee === null || viewingFee === undefined) {
      // Remove inspection fee
      updateData.viewingFee = undefined;
    } else {
      updateData.viewingFee = viewingFee;
    }

    const updatedHouse = await this.houseModel
      .findByIdAndUpdate(
        new Types.ObjectId(houseId),
        { $set: updateData },
        { new: true },
      )
      .exec();

    if (!updatedHouse) {
      throw new NotFoundException('House not found');
    }

    await updatedHouse.populate('agentId');
    return this.toHouseResponse(updatedHouse);
  }

  async remove(houseId: string, agentId: string): Promise<void> {
    await this.ensureAgentOwnsHouse(agentId, houseId);
    await this.houseModel
      .findByIdAndUpdate(new Types.ObjectId(houseId), {
        $set: { deleted: true },
      })
      .exec();
  }

  async getStats(agentId: string) {
    const houses = await this.houseModel
      .find({
        agentId: new Types.ObjectId(agentId),
        deleted: { $ne: true },
      })
      .lean()
      .exec();

    const totalViews = houses.reduce((sum, house) => sum + (house.viewCount || 0), 0);
    const totalWhatsAppClicks = houses.reduce(
      (sum, house) => sum + (house.whatsappClicks || 0),
      0,
    );

    return {
      totalListings: houses.length,
      totalViews,
      inquiries: totalWhatsAppClicks,
    };
  }

  async findByAgent(agentId: string) {
    const houses = await this.houseModel
      .find({
        agentId: new Types.ObjectId(agentId),
        deleted: { $ne: true },
      })
      .sort({ createdAt: -1 })
      .populate('agentId')
      .lean()
      .exec();

    return houses.map((house) => this.toHouseResponse(house));
  }

  async pauseListing(houseId: string, ownerId: string) {
    await this.ensureAgentOwnsHouse(ownerId, houseId);
    const updated = await this.houseModel.findByIdAndUpdate(
      new Types.ObjectId(houseId),
      { $set: { status: 'paused' } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('House not found');
    return this.toHouseResponse(updated);
  }

  async activateListing(houseId: string, ownerId: string) {
    await this.ensureAgentOwnsHouse(ownerId, houseId);
    const updated = await this.houseModel.findByIdAndUpdate(
      new Types.ObjectId(houseId),
      { $set: { status: 'active' } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('House not found');
    return this.toHouseResponse(updated);
  }

  async markRented(houseId: string, ownerId: string) {
    await this.ensureAgentOwnsHouse(ownerId, houseId);
    const updated = await this.houseModel.findByIdAndUpdate(
      new Types.ObjectId(houseId),
      { $set: { status: 'rented' } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('House not found');
    return this.toHouseResponse(updated);
  }

  async registerEnquiry(houseId: string, userId: string) {
    const house = await this.houseModel.findByIdAndUpdate(
      new Types.ObjectId(houseId),
      {
        $addToSet: { enquiredByUsers: userId },
        $inc: { whatsappClicks: 1 },
        $set: { enquiryEnabled: true },
      },
      { new: true },
    );
    if (!house) throw new NotFoundException('House not found');
    return { success: true };
  }

  async revealContact(houseId: string, userId: string) {
    const house = await this.houseModel.findById(new Types.ObjectId(houseId)).populate('agentId');
    if (!house) throw new NotFoundException('House not found');
    if (!house.enquiredByUsers?.includes(userId)) {
      throw new ForbiddenException('Enquiry required before revealing contact');
    }
    const owner = house.agentId as any;
    return { phone: owner?.phone ?? null };
  }

  async getPriceComparison(houseId: string) {
    const house = await this.houseModel.findById(new Types.ObjectId(houseId));
    if (!house) throw new NotFoundException('House not found');
    const areaMedianRent = house.annualRent ?? house.price ?? 0;
    return {
      areaMedianRent,
      priceVsMedian: 0,
      priceAlert: false,
    };
  }

  /**
   * True if another listing exists within `radiusKm` (default ~50m) for duplicate-address checks.
   */
  async checkDuplicateCoordinates(lat: number, lng: number, radiusKm = 0.05) {
    const res = await this.findAll({
      lat,
      lng,
      radius: radiusKm,
      limit: 50,
      skip: 0,
    });
    return {
      duplicate: (res.data?.length ?? 0) > 0,
      matches: res.data ?? [],
    };
  }

  private async ensureAgentOwnsHouse(agentId: string, houseId: string) {
    this.validateObjectId(houseId, 'property ID');
    this.validateObjectId(agentId, 'agent ID');
    
    try {
    const house = await this.houseModel
      .findOne({
        _id: new Types.ObjectId(houseId),
        agentId: new Types.ObjectId(agentId),
      })
      .exec();

    if (!house) {
      throw new ForbiddenException('You do not own this listing');
      }
    } catch (error) {
      // Catch BSON errors and convert to BadRequestException
      if (error instanceof Error && error.name === 'BSONError') {
        throw new BadRequestException('Invalid ID format');
      }
      throw error;
    }
  }

  async bookSlot(houseId: string, userId: string) {
    this.validateObjectId(houseId, 'property ID');
    this.validateObjectId(userId, 'user ID');
    
    try {
    const house = await this.houseModel
      .findById(new Types.ObjectId(houseId))
      .populate('agentId', 'name email phone')
      .exec();
    
    if (!house) {
      throw new NotFoundException('House not found');
    }

    if (!house.isShared) {
      throw new ForbiddenException('This property is not a shared property');
    }

    if ((house.availableSlots || 0) <= 0) {
      throw new ForbiddenException('No available slots');
    }

    const userIdObj = new Types.ObjectId(userId);
    
    // Check if user already booked a slot
    if (house.bookedByUsers?.some((id) => id.toString() === userId.toString())) {
      throw new ForbiddenException('You have already booked a slot in this property');
    }

    // Get user info for email
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get other users who already booked (before adding the new user)
    const otherBookedUserIds = (house.bookedByUsers || [])
      .filter((id: Types.ObjectId) => id.toString() !== userId.toString())
      .map((id: Types.ObjectId) => id.toString());

    // Add user to bookedByUsers and decrement availableSlots
    await this.houseModel.findByIdAndUpdate(
      new Types.ObjectId(houseId),
      {
        $push: { bookedByUsers: userIdObj },
        $inc: { availableSlots: -1 },
      },
    ).exec();

    const updatedHouse = await this.houseModel.findById(new Types.ObjectId(houseId)).exec();
    const slotsRemaining = updatedHouse?.availableSlots || 0;

    // Send slot booking email notifications
    const agent = house.agentId as any;
    if (agent?.email && user.email) {
      try {
        await this.emailService.sendSlotBookingEmail(
          user.email,
          user.name,
          agent.email,
          agent.name,
          house.title,
          house.location,
          slotsRemaining,
          house.totalSlots || 1,
        );
      } catch (error) {
        // Log error but don't fail the booking
        console.error('Failed to send slot booking email:', error);
      }
    }

    // Notify other users who already booked a slot
    if (otherBookedUserIds.length > 0) {
      try {
        const otherUsers = await Promise.all(
          otherBookedUserIds.map((id: string) => this.usersService.findById(id))
        );

        const validUsers = otherUsers.filter((u) => u && u.email) as Array<{ email: string; name: string }>;

        const notificationPromises = validUsers.map((existingUser) =>
          this.emailService.sendCoTenantNotificationEmail(
            existingUser.email,
            existingUser.name,
            user.name,
            house.title,
            house.location,
            slotsRemaining,
            house.totalSlots || 1,
          ).catch((error) => {
            console.error(`Failed to notify co-tenant ${existingUser.email}:`, error);
          })
        );

        await Promise.all(notificationPromises);
      } catch (error) {
        // Log error but don't fail the booking
        console.error('Failed to send co-tenant notifications:', error);
      }
    }
    
    return {
      success: true,
      message: 'Slot booked successfully',
      availableSlots: slotsRemaining,
    };
    } catch (error) {
      // Catch BSON errors and convert to BadRequestException
      if (error instanceof Error && error.name === 'BSONError') {
        throw new BadRequestException('Invalid ID format');
      }
      // Re-throw other errors (like NotFoundException, ForbiddenException)
      throw error;
    }
  }

  async cancelSlot(houseId: string, userId: string) {
    const house = await this.houseModel.findById(new Types.ObjectId(houseId)).exec();
    
    if (!house) {
      throw new NotFoundException('House not found');
    }

    if (!house.isShared) {
      throw new ForbiddenException('This property is not a shared property');
    }

    const userIdObj = new Types.ObjectId(userId);
    
    // Check if user has booked a slot
    if (!house.bookedByUsers?.some((id) => id.toString() === userId.toString())) {
      throw new ForbiddenException('You have not booked a slot in this property');
    }

    // Remove user from bookedByUsers and increment availableSlots
    await this.houseModel.findByIdAndUpdate(
      new Types.ObjectId(houseId),
      {
        $pull: { bookedByUsers: userIdObj },
        $inc: { availableSlots: 1 },
      },
    ).exec();

    const updatedHouse = await this.houseModel.findById(new Types.ObjectId(houseId)).exec();
    
    return {
      success: true,
      message: 'Slot cancelled successfully',
      availableSlots: updatedHouse?.availableSlots || 0,
    };
  }

  async getCoTenants(houseId: string, userId: string) {
    const house = await this.houseModel
      .findById(new Types.ObjectId(houseId))
      .populate('bookedByUsers', 'name email phone avatarUrl')
      .exec();
    
    if (!house) {
      throw new NotFoundException('House not found');
    }

    if (!house.isShared) {
      throw new ForbiddenException('This property is not a shared property');
    }

    // Check if user has booked a slot
    const userIdObj = new Types.ObjectId(userId);
    const hasBooked = house.bookedByUsers?.some((id) => 
      (typeof id === 'object' && id._id ? id._id.toString() : id.toString()) === userId.toString()
    );

    if (!hasBooked) {
      throw new ForbiddenException('You must book a slot to view co-tenants');
    }

    // Get co-tenants (other users who booked slots)
    const coTenants = (house.bookedByUsers || [])
      .filter((id) => {
        const idStr = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
        return idStr !== userId.toString();
      })
      .map((user: any) => {
        const userObj = typeof user === 'object' && user._id ? user : { _id: user };
        const populated = typeof user === 'object' && user.name ? user : null;
        
        if (populated) {
          const { _id, password, __v, ...rest } = populated;
          return {
            id: _id?.toString() || populated._id?.toString(),
            ...rest,
          };
        }
        
        return null;
      })
      .filter(Boolean);

    return { coTenants };
  }

  private toHouseResponse(
    house: HouseDocument | (House & { _id: Types.ObjectId; agentId?: any }),
  ) {
    const plain =
      'toObject' in house
        ? (house as HouseDocument).toObject({ getters: true })
        : (house as any);

    const { _id, __v, ...rest } = plain as any;
    const response: Record<string, any> = {
      id: (_id ?? plain.id)?.toString(),
      ...rest,
    };

    if (response.agentId && typeof response.agentId === 'object') {
      const {
        _id: agentObjectId,
        password,
        __v: agentVersion,
        ...agentRest
      } = response.agentId;
      response.agent = {
        id: agentObjectId ? agentObjectId.toString() : undefined,
        ...agentRest,
      };
      response.agentId = agentObjectId
        ? agentObjectId.toString()
        : response.agentId;
      if (response.agent) {
        delete response.agent.password;
        delete response.agent.__v;
      }
      if (agentVersion !== undefined) {
        delete response.agent.__v;
      }
    } else if (response.agentId) {
      response.agentId = response.agentId.toString();
    }

    // Convert bookedByUsers ObjectIds to strings
    if (response.bookedByUsers && Array.isArray(response.bookedByUsers)) {
      response.bookedByUsers = response.bookedByUsers.map((id: any) => {
        if (typeof id === 'object' && id._id) {
          return id._id.toString();
        }
        return id.toString();
      });
    }

    return response;
  }

  // ============ ADMIN METHODS ============

  async findAllAdmin(filters?: { flagged?: boolean }) {
    const query: FilterQuery<HouseDocument> = { deleted: { $ne: true } };
    
    if (filters?.flagged !== undefined) {
      query.flagged = filters.flagged;
    }

    const houses = await this.houseModel
      .find(query)
      .populate('agentId')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      data: houses.map((house) => this.toHouseResponse(house)),
    };
  }

  async flagProperty(propertyId: string, reason?: string) {
    const house = await this.houseModel.findById(propertyId);
    if (!house) {
      throw new NotFoundException('Property not found');
    }

    house.flagged = true;
    house.flaggedReason = reason;
    house.flaggedAt = new Date();
    await house.save();

    return this.toHouseResponse(house);
  }

  async unflagProperty(propertyId: string) {
    const house = await this.houseModel.findById(propertyId);
    if (!house) {
      throw new NotFoundException('Property not found');
    }

    house.flagged = false;
    house.flaggedReason = undefined;
    house.flaggedAt = undefined;
    await house.save();

    return this.toHouseResponse(house);
  }

  /**
   * Mark a property's address as verified (admin action).
   */
  async verifyPropertyAddress(propertyId: string) {
    const house = await this.houseModel.findById(propertyId);
    if (!house) {
      throw new NotFoundException('Property not found');
    }

    house.addressVerified = true;
    await house.save();

    return this.toHouseResponse(house);
  }

  async delistAgentProperties(agentId: string) {
    await this.houseModel.updateMany(
      { agentId: new Types.ObjectId(agentId), deleted: { $ne: true } },
      { deleted: true },
    );
    return { success: true, message: 'All agent properties have been delisted' };
  }

  async delete(houseId: string): Promise<void> {
    const house = await this.houseModel.findById(houseId);
    if (!house) {
      throw new NotFoundException('Property not found');
    }
    await this.houseModel.findByIdAndUpdate(houseId, { deleted: true }).exec();
  }
}
