import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ManagementRequest,
  ManagementRequestDocument,
  ManagementRequestStatus,
} from './schemas/management-request.schema';
import {
  PropertyLead,
  PropertyLeadDocument,
  PropertyLeadStatus,
  PropertyLeadType,
} from './schemas/property-lead.schema';
import { CreateManagementRequestDto } from './dto/create-management-request.dto';
import { UpdateManagementRequestDto } from './dto/update-management-request.dto';
import { LocationVerifyDto } from './dto/location-verify.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { House, HouseDocument } from '../houses/schemas/house.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { AGENT_ONSITE_VERIFY_RADIUS_M, haversineMeters } from '../common/geo.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';

const LISTING_OWNER_ROLES = new Set<UserRole>([
  UserRole.Landlord,
  UserRole.RealEstateCompany,
  UserRole.Company,
]);

@Injectable()
export class PropertyManagementService {
  constructor(
    @InjectModel(ManagementRequest.name)
    private readonly requestModel: Model<ManagementRequestDocument>,
    @InjectModel(PropertyLead.name)
    private readonly leadModel: Model<PropertyLeadDocument>,
    @InjectModel(House.name)
    private readonly houseModel: Model<HouseDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  private validateObjectId(id: string, label = 'ID') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label}`);
    }
  }

  private haversineMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async getHouseOrThrow(propertyId: string) {
    this.validateObjectId(propertyId, 'property ID');
    const house = await this.houseModel
      .findOne({ _id: propertyId, deleted: { $ne: true } })
      .exec();
    if (!house) {
      throw new NotFoundException('Property not found');
    }
    return house;
  }

  private getLandlordId(house: HouseDocument): Types.ObjectId {
    return house.agentId as Types.ObjectId;
  }

  async getActiveAgentIds(propertyId: string): Promise<Types.ObjectId[]> {
    const rows = await this.requestModel
      .find({
        propertyId: new Types.ObjectId(propertyId),
        status: ManagementRequestStatus.Accepted,
      })
      .select('agentId')
      .lean()
      .exec();
    return rows.map((r) => r.agentId as Types.ObjectId);
  }

  async createRequest(agentUserId: string, dto: CreateManagementRequestDto) {
    const agent = await this.userModel.findById(agentUserId).exec();
    if (!agent || agent.role !== UserRole.Agent) {
      throw new ForbiddenException('Only agents can request property management');
    }

    const house = await this.getHouseOrThrow(dto.propertyId);
    const landlordId = this.getLandlordId(house);

    if (landlordId.equals(agentUserId)) {
      throw new BadRequestException('You cannot manage your own listing');
    }

    const existing = await this.requestModel.findOne({
      propertyId: house._id,
      agentId: new Types.ObjectId(agentUserId),
      status: { $in: [ManagementRequestStatus.Pending, ManagementRequestStatus.Accepted] },
    });
    if (existing) {
      throw new BadRequestException(
        existing.status === ManagementRequestStatus.Accepted
          ? 'You already manage this property'
          : 'A pending request already exists for this property',
      );
    }

    const doc = await this.requestModel.create({
      propertyId: house._id,
      agentId: new Types.ObjectId(agentUserId),
      landlordId,
      message: dto.message,
      bio: dto.bio ?? agent.bio,
      status: ManagementRequestStatus.Pending,
    });

    // Notify the landlord so they can review the agent's profile and approve.
    await this.notificationsService.create({
      userId: landlordId.toString(),
      type: NotificationType.ManagementRequest,
      title: 'New agent management request',
      body: `${agent.name} wants to manage "${house.title}". Review their profile and approve.`,
      link: '/landlord/dashboard',
      data: {
        requestId: doc._id.toString(),
        propertyId: house._id.toString(),
        agentId: agentUserId,
      },
    });

    return this.populateRequest(doc._id.toString());
  }

  async listOutgoing(agentUserId: string) {
    return this.requestModel
      .find({ agentId: new Types.ObjectId(agentUserId) })
      .sort({ createdAt: -1 })
      .populate('propertyId', 'title location price images')
      .populate('landlordId', 'name email avatarUrl')
      .lean()
      .exec();
  }

  async listIncoming(landlordUserId: string) {
    return this.requestModel
      .find({ landlordId: new Types.ObjectId(landlordUserId) })
      .sort({ createdAt: -1 })
      .populate('propertyId', 'title location price images')
      .populate('agentId', 'name email avatarUrl verified bio phone')
      .lean()
      .exec();
  }

  async updateRequest(
    requestId: string,
    actorUserId: string,
    dto: UpdateManagementRequestDto,
  ) {
    this.validateObjectId(requestId, 'request ID');
    const request = await this.requestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Management request not found');
    }

    const isLandlord = request.landlordId.toString() === actorUserId;
    const isAgent = request.agentId.toString() === actorUserId;

    if (dto.status === ManagementRequestStatus.Revoked) {
      if (!isLandlord && !isAgent) {
        throw new ForbiddenException('Not allowed to revoke this request');
      }
    } else if (!isLandlord) {
      throw new ForbiddenException('Only the property owner can accept or reject requests');
    }

    if (
      request.status !== ManagementRequestStatus.Pending &&
      dto.status !== ManagementRequestStatus.Revoked
    ) {
      throw new BadRequestException('Request has already been responded to');
    }

    request.status = dto.status;
    request.responseNote = dto.responseNote;
    request.respondedAt = new Date();
    await request.save();

    // Tell the agent the outcome of their request.
    if (
      dto.status === ManagementRequestStatus.Accepted ||
      dto.status === ManagementRequestStatus.Rejected
    ) {
      const house = await this.houseModel
        .findById(request.propertyId)
        .select('title')
        .lean()
        .exec();
      const approved = dto.status === ManagementRequestStatus.Accepted;
      await this.notificationsService.create({
        userId: request.agentId.toString(),
        type: NotificationType.ManagementResponse,
        title: approved ? 'Management request approved' : 'Management request declined',
        body: approved
          ? `You can now manage "${house?.title ?? 'the property'}" — talk to house hunters and verify on-site.`
          : `Your request to manage "${house?.title ?? 'the property'}" was declined.`,
        link: '/agent/dashboard',
        data: {
          requestId: request._id.toString(),
          propertyId: request.propertyId.toString(),
          status: dto.status,
        },
      });
    }

    return this.populateRequest(requestId);
  }

  private async populateRequest(id: string) {
    return this.requestModel
      .findById(id)
      .populate('propertyId', 'title location price images')
      .populate('agentId', 'name email avatarUrl verified')
      .populate('landlordId', 'name email avatarUrl')
      .lean()
      .exec();
  }

  async listManagedProperties(agentUserId: string) {
    const accepted = await this.requestModel
      .find({
        agentId: new Types.ObjectId(agentUserId),
        status: ManagementRequestStatus.Accepted,
      })
      .populate({
        path: 'propertyId',
        populate: { path: 'agentId', select: 'name email avatarUrl' },
      })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return accepted.map((row) => ({
      managementRequestId: row._id,
      property: row.propertyId,
      acceptedAt: row.respondedAt ?? (row as any).createdAt,
    }));
  }

  async recordPropertyView(propertyId: string, viewerId?: string) {
    const house = await this.getHouseOrThrow(propertyId);
    const landlordId = this.getLandlordId(house);
    const agentIds = await this.getActiveAgentIds(propertyId);

    let viewerName: string | undefined;
    let viewerEmail: string | undefined;

    if (viewerId) {
      const viewer = await this.userModel.findById(viewerId).select('name email role').lean();
      if (viewer) {
        viewerName = viewer.name;
        viewerEmail = viewer.email;
        const hunterRoles = new Set<UserRole>([
          UserRole.User,
          UserRole.Tenant,
          UserRole.HouseHunter,
        ]);
        if (!hunterRoles.has(viewer.role as UserRole) && viewer._id.toString() === landlordId.toString()) {
          return { recorded: false, reason: 'owner_view' };
        }
      }
    }

    const lead = await this.leadModel.create({
      propertyId: house._id,
      viewerId: viewerId ? new Types.ObjectId(viewerId) : undefined,
      landlordId,
      agentIds,
      type: PropertyLeadType.View,
      status: PropertyLeadStatus.New,
      viewerName,
      viewerEmail,
    });

    await this.houseModel.findByIdAndUpdate(house._id, { $inc: { viewCount: 1 } }).exec();

    // Notify the owner + every managing agent so they can follow up the viewer.
    const viewerLabel = viewerName || 'Someone';
    const baseData = {
      propertyId: house._id.toString(),
      leadId: lead._id.toString(),
      viewerId: viewerId ?? null,
      viewerName: viewerName ?? null,
    };
    const viewBody = `${viewerLabel} viewed "${house.title}". Follow up from your leads.`;

    if (landlordId.toString() !== viewerId) {
      await this.notificationsService.create({
        userId: landlordId.toString(),
        type: NotificationType.PropertyView,
        title: 'New property view',
        body: viewBody,
        link: '/landlord/dashboard',
        data: baseData,
      });
    }

    const agentRecipients = agentIds
      .map((id) => id.toString())
      .filter((id) => id !== viewerId);
    await this.notificationsService.createMany(agentRecipients, {
      type: NotificationType.PropertyView,
      title: 'New property view',
      body: viewBody,
      link: '/agent/dashboard',
      data: baseData,
    });

    return {
      recorded: true,
      leadId: lead._id,
      notifiedAgents: agentIds.length,
    };
  }

  async listAgentLeads(agentUserId: string) {
    return this.leadModel
      .find({ agentIds: new Types.ObjectId(agentUserId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('propertyId', 'title location price images')
      .populate('viewerId', 'name email avatarUrl phone')
      .lean()
      .exec();
  }

  async listLandlordLeads(landlordUserId: string) {
    return this.leadModel
      .find({ landlordId: new Types.ObjectId(landlordUserId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('propertyId', 'title location price images')
      .populate('viewerId', 'name email avatarUrl phone')
      .lean()
      .exec();
  }

  async updateLead(leadId: string, actorUserId: string, dto: UpdateLeadDto) {
    this.validateObjectId(leadId, 'lead ID');
    const lead = await this.leadModel.findById(leadId).exec();
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const agentIdStr = actorUserId;
    const canUpdate =
      lead.landlordId.toString() === agentIdStr ||
      lead.agentIds.some((id) => id.toString() === agentIdStr);

    if (!canUpdate) {
      throw new ForbiddenException('Not allowed to update this lead');
    }

    lead.status = dto.status;
    await lead.save();
    return lead.toObject();
  }

  async verifyLocation(
    propertyId: string,
    agentUserId: string,
    dto: LocationVerifyDto,
  ) {
    const agent = await this.userModel.findById(agentUserId).exec();
    if (!agent || agent.role !== UserRole.Agent) {
      throw new ForbiddenException('Only agents can verify property location');
    }

    const accepted = await this.requestModel.findOne({
      propertyId: new Types.ObjectId(propertyId),
      agentId: new Types.ObjectId(agentUserId),
      status: ManagementRequestStatus.Accepted,
    });
    if (!accepted) {
      throw new ForbiddenException('You must have accepted management for this property');
    }

    const house = await this.getHouseOrThrow(propertyId);
    if (!house.coordinates?.lat || !house.coordinates?.lng) {
      throw new BadRequestException('Property has no coordinates to verify against');
    }

    const distance = haversineMeters(
      dto.lat,
      dto.lng,
      house.coordinates.lat,
      house.coordinates.lng,
    );

    if (distance > AGENT_ONSITE_VERIFY_RADIUS_M) {
      throw new BadRequestException(
        `You must be within ${AGENT_ONSITE_VERIFY_RADIUS_M}m of the property (currently ~${Math.round(distance)}m away)`,
      );
    }

    const verification = {
      lat: dto.lat,
      lng: dto.lng,
      accuracy: dto.accuracy,
      verifiedBy: new Types.ObjectId(agentUserId),
      verifiedAt: new Date(),
      distanceMeters: Math.round(distance),
      notes: dto.notes,
    };

    await this.houseModel.findByIdAndUpdate(house._id, {
      agentLocationVerification: verification,
      coordinatesVerifiedOnSite: true,
    });

    return { success: true, distanceMeters: Math.round(distance), verification };
  }

  async agentCanManageProperty(agentUserId: string, propertyId: string): Promise<boolean> {
    const row = await this.requestModel.findOne({
      propertyId: new Types.ObjectId(propertyId),
      agentId: new Types.ObjectId(agentUserId),
      status: ManagementRequestStatus.Accepted,
    });
    return Boolean(row);
  }

  static isListingOwnerRole(role: UserRole): boolean {
    return LISTING_OWNER_ROLES.has(role);
  }
}
