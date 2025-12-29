import {
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

@Injectable()
export class HousesService {
  constructor(
    @InjectModel(House.name)
    private readonly houseModel: Model<HouseDocument>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly alertsService: AlertsService,
  ) {}

  async create(agentId: string, dto: CreateHouseDto) {
    const agent = await this.usersService.findById(agentId);

    if (!agent || (agent.role !== UserRole.Agent && agent.role !== UserRole.Landlord)) {
      throw new ForbiddenException('Only agents and landlords can create listings');
    }

    const house = new this.houseModel({
      ...dto,
      agentId: new Types.ObjectId(agentId),
    });

    const savedHouse = await house.save();
    await savedHouse.populate('agentId');
    await this.alertsService.handleHouseCreated(savedHouse);

    return this.toHouseResponse(savedHouse);
  }

  async findAll(filters: FilterHousesDto) {
    const query: FilterQuery<HouseDocument> = { deleted: { $ne: true } };
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

    // Sort by location if coordinates provided (show ALL properties, just sorted by distance)
    if (filters.lat !== undefined && filters.lng !== undefined) {
      // Separate houses with and without coordinates
      const housesWithCoords: any[] = [];
      const housesWithoutCoords: any[] = [];

      houseDocs.forEach((house: any) => {
        if (house.coordinates && house.coordinates.lat && house.coordinates.lng) {
          housesWithCoords.push(house);
        } else {
          housesWithoutCoords.push(house);
        }
      });

      // Sort houses with coordinates by distance (closest first) - show ALL, not filtered by radius
      housesWithCoords.sort((a: any, b: any) => {
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

      // Sort houses without coordinates by creation date (newest first)
      housesWithoutCoords.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      // Combine: houses with coordinates first (sorted by distance), then houses without coordinates
      houseDocs = [...housesWithCoords, ...housesWithoutCoords];
    } else {
      // Default sort by creation date
      houseDocs.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    }

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
  }

  async trackView(id: string) {
    await this.houseModel
      .findByIdAndUpdate(new Types.ObjectId(id), {
        $inc: { viewCount: 1 },
      })
      .exec();
    return { success: true };
  }

  async trackWhatsAppClick(id: string) {
    await this.houseModel
      .findByIdAndUpdate(new Types.ObjectId(id), {
        $inc: { whatsappClicks: 1 },
      })
      .exec();
    return { success: true };
  }

  async update(
    houseId: string,
    agentId: string,
    dto: UpdateHouseDto,
  ) {
    await this.ensureAgentOwnsHouse(agentId, houseId);

    const updatedHouse = await this.houseModel
      .findByIdAndUpdate(
        new Types.ObjectId(houseId),
        { $set: dto },
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

  private async ensureAgentOwnsHouse(agentId: string, houseId: string) {
    const house = await this.houseModel
      .findOne({
        _id: new Types.ObjectId(houseId),
        agentId: new Types.ObjectId(agentId),
      })
      .exec();

    if (!house) {
      throw new ForbiddenException('You do not own this listing');
    }
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

    return response;
  }
}
