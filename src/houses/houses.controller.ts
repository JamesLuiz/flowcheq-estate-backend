import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { FilesInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { HousesService } from './houses.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { FilterHousesDto } from './dto/filter-houses.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CloudinaryService } from './cloudinary.service';
import { UserRole } from '../users/schemas/user.schema';
import { parseOwnershipDocTypes } from './listing-validation.util';
import {
  GPS_PHOTO_MAX,
  GPS_PHOTO_MIN,
  OwnershipDocumentType,
} from '../common/listing-requirements';
import { Types } from 'mongoose';

@Controller(['houses', 'properties'])
@ApiTags('Houses')
export class HousesController {
  constructor(
    private readonly housesService: HousesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Landlord, UserRole.RealEstateCompany, UserRole.Company)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 8 },
      { name: 'proofOfAddress', maxCount: 1 },
      { name: 'ownershipDocuments', maxCount: 4 },
      { name: 'taggedPhotos', maxCount: 6 },
    ]),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new property listing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: '3 bedroom flat in Lekki' },
        description: { type: 'string', example: 'Spacious apartment with balcony and good lighting' },
        price: { type: 'number', example: 15000000 },
        location: { type: 'string', example: 'Lekki, Lagos' },
        type: { type: 'string', example: 'Apartment' },
        bedrooms: { type: 'number', example: 3 },
        bathrooms: { type: 'number', example: 2 },
        area: { type: 'number', example: 120 },
        featured: { type: 'boolean', example: false },
        lat: { type: 'number', example: 6.5244 },
        lng: { type: 'number', example: 3.3792 },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: '3-5 image files (jpg, jpeg, png, webp, max 5MB each)',
        },
      },
      required: ['title', 'description', 'price', 'location', 'type'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Property listing created successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        title: '3 bedroom flat in Lekki',
        description: 'Spacious apartment with balcony and good lighting',
        price: 15000000,
        location: 'Lekki, Lagos',
        type: 'Apartment',
        images: ['https://res.cloudinary.com/.../image1.jpg'],
        agentId: '64a1f2e9c...',
        bedrooms: 3,
        bathrooms: 2,
        area: 120,
        featured: false,
        viewCount: 0,
        whatsappClicks: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error or invalid image count' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() body: any,
    @UploadedFiles() files?: {
      images?: Express.Multer.File[];
      proofOfAddress?: Express.Multer.File[];
      ownershipDocuments?: Express.Multer.File[];
      taggedPhotos?: Express.Multer.File[];
    },
  ) {
    const imageFiles = files?.images || [];
    const proofFile = files?.proofOfAddress?.[0];
    const ownershipDocFiles = files?.ownershipDocuments || [];
    const taggedPhotoFiles = files?.taggedPhotos || [];
    console.log('Received house creation request:', {
      title: body.title,
      description: body.description?.substring(0, 50) + '...',
      price: body.price,
      location: body.location,
      type: body.type,
      filesCount: imageFiles.length,
      taggedPhotosCount: taggedPhotoFiles.length,
      hasProofOfAddress: !!proofFile,
      hasCoordinates: !!(body.coordinates || (body.lat && body.lng)),
    });
    // Parse form data fields (they come as strings in multipart/form-data)
    // Strip HTML from description if it contains HTML tags
    let description = body.description || '';
    if (description && description.includes('<')) {
      // Simple HTML stripping - remove tags but keep text content
      description = description
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }

    // Validate description is not empty after stripping HTML
    if (!description || description.length === 0) {
      throw new BadRequestException('Description is required and cannot be empty');
    }

    const dto: CreateHouseDto = {
      title: body.title,
      description: description,
      price: Number(body.price),
      location: body.location,
      type: body.type,
      bedrooms: body.bedrooms ? Number(body.bedrooms) : undefined,
      bathrooms: body.bathrooms ? Number(body.bathrooms) : undefined,
      area: body.area ? Number(body.area) : undefined,
      featured: body.featured === 'true' || body.featured === true,
      isShared: body.isShared === 'true' || body.isShared === true,
      totalSlots: body.totalSlots ? Number(body.totalSlots) : undefined,
      viewingFee: body.viewingFee ? Number(body.viewingFee) : undefined,
      listingType: body.listingType || 'buy',
      isAirbnb: body.isAirbnb === 'true' || body.isAirbnb === true,
    };

    // Parse coordinates if provided
    if (body.coordinates) {
      try {
        const coords = typeof body.coordinates === 'string' 
          ? JSON.parse(body.coordinates) 
          : body.coordinates;
        if (coords.lat && coords.lng) {
          dto.coordinates = {
            lat: Number(coords.lat),
            lng: Number(coords.lng),
          };
        }
      } catch (error) {
        // Invalid coordinates format, skip
      }
    } else if (body.lat && body.lng) {
      // Alternative format: lat and lng as separate fields
      dto.coordinates = {
        lat: Number(body.lat),
        lng: Number(body.lng),
      };
    }

    let imageUrls: string[] = [];
    let imagePublicIds: string[] = [];
    let proofOfAddressUrl: string | undefined;
    let proofOfAddressPublicId: string | undefined;

    const pendingHouseId = new Types.ObjectId();
    const houseId = pendingHouseId.toString();

    // Upload proof of address if provided
    if (proofFile) {
      // Validate proof of address file
      const maxSize = 10 * 1024 * 1024; // 10MB for documents
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/jpg',
      ];

      if (!allowedTypes.includes(proofFile.mimetype)) {
        throw new BadRequestException(
          'Proof of address must be a PDF or image file (JPG, PNG)',
        );
      }
      if (proofFile.size > maxSize) {
        throw new BadRequestException(
          `Proof of address file exceeds the maximum size of 10MB`,
        );
      }

      const proofUpload = await this.cloudinaryService.uploadForHouse(
        houseId,
        proofFile.buffer,
        proofFile.originalname,
        'documents',
      );
      proofOfAddressUrl = proofUpload.url;
      proofOfAddressPublicId = proofUpload.publicId;
    }

    if (taggedPhotoFiles.length > GPS_PHOTO_MAX) {
      throw new BadRequestException(`Maximum ${GPS_PHOTO_MAX} GPS photos allowed`);
    }

    let taggedPhotosCount = taggedPhotoFiles.length;
    if (taggedPhotosCount === 0 && body.taggedPhotos) {
      try {
        const parsed = typeof body.taggedPhotos === 'string' ? JSON.parse(body.taggedPhotos) : body.taggedPhotos;
        if (Array.isArray(parsed)) {
          taggedPhotosCount = parsed.length;
        }
      } catch {
        // ignore
      }
    }
    if (taggedPhotosCount < GPS_PHOTO_MIN || taggedPhotosCount > GPS_PHOTO_MAX) {
      throw new BadRequestException(
        `Please provide ${GPS_PHOTO_MIN}–${GPS_PHOTO_MAX} GPS-verified property photos.`,
      );
    }

    const ownershipDocTypes = parseOwnershipDocTypes(body.ownershipDocTypes);
    if (ownershipDocFiles.length !== ownershipDocTypes.length) {
      throw new BadRequestException(
        'Each ownership document file must have a matching type in ownershipDocTypes JSON array.',
      );
    }

    // Upload image files to Cloudinary if provided (legacy)
    if (imageFiles && imageFiles.length > 0) {
      // Log each file's metadata for debugging
      imageFiles.forEach((file, idx) => {
        console.log(`Received file[${idx}]: name=${file.originalname}, mimetype=${file.mimetype}, size=${file.size}`);
      });

      if (imageFiles.length > 8) {
        throw new BadRequestException('You can upload a maximum of 8 images');
      }

      // Additional safety: ensure all files are images and within size
      const maxSize = 5 * 1024 * 1024; // 5MB
      const allowedPrefix = /^image\//i;
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/pjpeg', 'image/x-png'];

      for (const file of imageFiles) {
        if (!file.mimetype || !allowedPrefix.test(file.mimetype)) {
          throw new BadRequestException(`Invalid file type: ${file.mimetype || 'unknown'}. Only image/* uploads are allowed.`);
        }
        if (file.size > maxSize) {
          throw new BadRequestException(`File ${file.originalname} exceeds the maximum size of 5MB.`);
        }
        if (!allowedTypes.includes(file.mimetype.toLowerCase())) {
          // Warn but allow lesser-known image/* types
          console.warn('Uncommon image MIME type received:', file.mimetype);
        }
      }

      const uploadResults = await Promise.all(
        imageFiles.map((file) =>
          this.cloudinaryService.uploadForHouse(houseId, file.buffer, file.originalname, 'photos'),
        ),
      );
      imageUrls = uploadResults.map((r) => r.url);
      imagePublicIds = uploadResults.map((r) => r.publicId);
    } else if (body.images) {
      // Fallback to URL strings if provided
      imageUrls = Array.isArray(body.images)
        ? body.images
        : body.images.split(',').map((url: string) => url.trim()).filter(Boolean);
    }

    let ownershipDocuments: Array<{ type: string; url: string; publicId?: string; uploadedAt: Date }> = [];
    if (ownershipDocFiles.length > 0) {
      const maxDocSize = 10 * 1024 * 1024;
      const allowedDocTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      for (let i = 0; i < ownershipDocFiles.length; i++) {
        const file = ownershipDocFiles[i];
        if (!allowedDocTypes.includes(file.mimetype)) {
          throw new BadRequestException('Ownership documents must be PDF or image files');
        }
        if (file.size > maxDocSize) {
          throw new BadRequestException('Ownership document exceeds 10MB');
        }
        const upload = await this.cloudinaryService.uploadForHouse(
          houseId,
          file.buffer,
          file.originalname,
          'ownership',
        );
        ownershipDocuments.push({
          type: ownershipDocTypes[i],
          url: upload.url,
          publicId: upload.publicId,
          uploadedAt: new Date(),
        });
      }
    } else if (proofOfAddressUrl) {
      const fallbackType =
        dto.listingType === 'rent'
          ? OwnershipDocumentType.UtilityBill
          : OwnershipDocumentType.COfO;
      ownershipDocuments.push({
        type: fallbackType,
        url: proofOfAddressUrl,
        publicId: proofOfAddressPublicId,
        uploadedAt: new Date(),
      });
    }

    let taggedPhotos:
      | Array<{
          url: string;
          publicId?: string;
          tag: string;
          description?: string;
          lat?: number;
          lng?: number;
          accuracy?: number;
          capturedAt?: Date;
          gpsVerified?: boolean;
        }>
      | undefined;
    if (taggedPhotoFiles.length > 0) {
      const tags = body.taggedPhotoTags
        ? typeof body.taggedPhotoTags === 'string'
          ? JSON.parse(body.taggedPhotoTags)
          : body.taggedPhotoTags
        : [];
      const descriptions = body.taggedPhotoDescriptions
        ? typeof body.taggedPhotoDescriptions === 'string'
          ? JSON.parse(body.taggedPhotoDescriptions)
          : body.taggedPhotoDescriptions
        : [];
      let gpsMeta: Array<{ lat?: number; lng?: number; accuracy?: number; capturedAt?: string }> = [];
      if (body.taggedPhotoGps) {
        try {
          gpsMeta =
            typeof body.taggedPhotoGps === 'string' ? JSON.parse(body.taggedPhotoGps) : body.taggedPhotoGps;
        } catch {
          throw new BadRequestException('Invalid taggedPhotoGps JSON');
        }
      }

      const taggedPhotoUploadResults = await Promise.all(
        taggedPhotoFiles.map((file) =>
          this.cloudinaryService.uploadForHouse(houseId, file.buffer, file.originalname, 'photos'),
        ),
      );

      taggedPhotos = taggedPhotoUploadResults.map((upload, index) => {
        const gps = gpsMeta[index];
        const hasGps = gps?.lat != null && gps?.lng != null;
        return {
          url: upload.url,
          publicId: upload.publicId,
          tag: tags[index] || 'other',
          description: descriptions[index] || undefined,
          lat: gps?.lat,
          lng: gps?.lng,
          accuracy: gps?.accuracy,
          capturedAt: gps?.capturedAt ? new Date(gps.capturedAt) : new Date(),
          gpsVerified: hasGps,
        };
      });
    } else if (body.taggedPhotos) {
      // Fallback: if taggedPhotos provided as JSON (for API calls)
      try {
        const parsed = typeof body.taggedPhotos === 'string' ? JSON.parse(body.taggedPhotos) : body.taggedPhotos;
        if (Array.isArray(parsed) && parsed.length > 0) {
          taggedPhotos = parsed;
        }
      } catch (error) {
        // Invalid JSON, skip tagged photos
      }
    }

    // If no legacy images were provided, derive the main images from tagged photos
    if ((!imageUrls || imageUrls.length === 0) && taggedPhotos && taggedPhotos.length > 0) {
      imageUrls = taggedPhotos.map((p) => p.url);
    }

    try {
      return await this.housesService.create(
        user.sub,
        {
          ...dto,
          images: imageUrls,
          imagePublicIds,
          proofOfAddress: proofOfAddressUrl,
          proofOfAddressPublicId,
          ownershipDocuments: ownershipDocuments as CreateHouseDto['ownershipDocuments'],
          taggedPhotos,
        },
        pendingHouseId,
      );
    } catch (error: any) {
      await this.cloudinaryService.purgeHouseMedia(houseId);
      console.error('Error creating house:', error);
      // Re-throw with better error message
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Preserve original HTTP exceptions like Forbidden/Unauthorized
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(error?.message || 'Failed to create property listing');
    }
  }

  @Post('check-duplicate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('landlord', 'real_estate_company')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Check if coordinates already have a listing nearby',
    description:
      'Uses a small default radius (~50m). Returns whether any listing exists in that area and optional match summaries.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        lat: { type: 'number', example: 6.5244 },
        lng: { type: 'number', example: 3.3792 },
        radiusKm: {
          type: 'number',
          example: 0.05,
          description: 'Optional radius in km (default 0.05 ≈ 50m)',
        },
      },
      required: ['lat', 'lng'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Duplicate check result',
    schema: {
      example: {
        duplicate: false,
        matches: [],
      },
    },
  })
  checkDuplicate(
    @CurrentUser() _user: RequestUser,
    @Body() body: { lat: number; lng: number; radiusKm?: number },
  ) {
    return this.housesService.checkDuplicateCoordinates(
      body.lat,
      body.lng,
      body.radiusKm ?? 0.05,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all property listings with optional filters',
    description:
      'Supports text/price/type filters. With `lat`, `lng`, and optional `radius` (km, default 10), returns only listings within that radius, sorted by distance. Use `amenities` as comma-separated slugs (e.g. wifi,parking) — listings must include all requested amenities.',
  })
  @ApiQuery({
    name: 'amenities',
    required: false,
    description: 'Comma-separated amenity slugs; listing must include all (e.g. wifi,parking)',
    example: 'wifi,parking',
  })
  @ApiQuery({
    name: 'lat',
    required: false,
    description: 'Latitude for radius filter (use with lng)',
    example: 6.5244,
  })
  @ApiQuery({
    name: 'lng',
    required: false,
    description: 'Longitude for radius filter (use with lat)',
    example: 3.3792,
  })
  @ApiQuery({
    name: 'radius',
    required: false,
    description: 'Radius in km when lat/lng are set (default 10)',
    example: 5,
  })
  @ApiResponse({
    status: 200,
    description: 'List of property listings',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            title: '3 bedroom flat in Lekki',
            price: 15000000,
            location: 'Lekki, Lagos',
            type: 'Apartment',
            images: ['https://res.cloudinary.com/.../image1.jpg'],
            agentId: {
              _id: '64a1f2e9c...',
              name: 'Eliezer James',
              verified: true,
            },
            bedrooms: 3,
            bathrooms: 2,
            area: 120,
            featured: false,
            viewCount: 10,
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        total: 100,
        limit: 20,
        skip: 0,
      },
    },
  })
  findAll(@Query() filters: FilterHousesDto) {
    return this.housesService.findAll(filters);
  }

  @Get('stats/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get property statistics for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Property statistics',
    schema: {
      example: {
        totalListings: 10,
        totalViews: 500,
        inquiries: 50,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getStats(@CurrentUser() user: RequestUser) {
    return this.housesService.getStats(user.sub);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Owner's own listings (all statuses)" })
  myListings(@CurrentUser() user: RequestUser) {
    return this.housesService.findByAgent(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single property listing by ID' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Property listing details',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        title: '3 bedroom flat in Lekki',
        description: 'Spacious apartment with balcony and good lighting',
        price: 15000000,
        location: 'Lekki, Lagos',
        type: 'Apartment',
        images: ['https://res.cloudinary.com/.../image1.jpg'],
        agentId: {
          _id: '64a1f2e9c...',
          name: 'Eliezer James',
          email: 'jameseliezer116@gmail.com',
          phone: '+2348093117933',
          verified: true,
          avatarUrl: 'https://example.com/avatar.jpg',
        },
        coordinates: { lat: 6.5244, lng: 3.3792 },
        bedrooms: 3,
        bathrooms: 2,
        area: 120,
        featured: false,
        viewCount: 10,
        whatsappClicks: 5,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  findOne(@Param('id') id: string) {
    return this.housesService.findOne(id, true);
  }

  @Post(':id/view')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Track a view on a property listing' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  trackView(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.housesService.trackView(id, user?.sub);
  }

  @Post(':id/whatsapp-click')
  @ApiOperation({ summary: 'Track a WhatsApp click on a property listing' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'WhatsApp click tracked successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        whatsappClicks: 6,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  trackWhatsAppClick(@Param('id') id: string) {
    return this.housesService.trackWhatsAppClick(id);
  }

  @Post(':id/photos/gps-capture')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Landlord, UserRole.RealEstateCompany, UserRole.Company)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'taggedPhotos', maxCount: GPS_PHOTO_MAX }]))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload GPS-captured photos for an existing listing (Flowcheq Capture)' })
  async uploadGpsCapturedPhotos(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: { taggedPhotos?: Express.Multer.File[] },
  ) {
    const taggedPhotoFiles = files?.taggedPhotos ?? [];
    if (taggedPhotoFiles.length < GPS_PHOTO_MIN || taggedPhotoFiles.length > GPS_PHOTO_MAX) {
      throw new BadRequestException(
        `Provide ${GPS_PHOTO_MIN}–${GPS_PHOTO_MAX} GPS-captured photos.`,
      );
    }

    const tags = body.taggedPhotoTags
      ? typeof body.taggedPhotoTags === 'string'
        ? JSON.parse(body.taggedPhotoTags as string)
        : body.taggedPhotoTags
      : [];
    const descriptions = body.taggedPhotoDescriptions
      ? typeof body.taggedPhotoDescriptions === 'string'
        ? JSON.parse(body.taggedPhotoDescriptions as string)
        : body.taggedPhotoDescriptions
      : [];
    let gpsMeta: Array<{ lat?: number; lng?: number; accuracy?: number; capturedAt?: string }> =
      [];
    if (body.taggedPhotoGps) {
      try {
        gpsMeta =
          typeof body.taggedPhotoGps === 'string'
            ? JSON.parse(body.taggedPhotoGps as string)
            : (body.taggedPhotoGps as typeof gpsMeta);
      } catch {
        throw new BadRequestException('Invalid taggedPhotoGps JSON');
      }
    }

    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    await this.cloudinaryService.deleteHousePhotos(id);

    const taggedPhotos = await Promise.all(
      taggedPhotoFiles.map(async (file, index) => {
        if (!allowedImageTypes.includes(file.mimetype)) {
          throw new BadRequestException('Photos must be JPEG, PNG, or WebP');
        }
        if (file.size > maxSize) {
          throw new BadRequestException('Each photo must be under 5MB');
        }
        const gps = gpsMeta[index];
        const hasGps =
          gps?.lat != null && gps?.lng != null && !Number.isNaN(gps.lat) && !Number.isNaN(gps.lng);
        if (!hasGps) {
          throw new BadRequestException(
            `Photo ${index + 1} must include GPS coordinates from Flowcheq Capture.`,
          );
        }
        const upload = await this.cloudinaryService.uploadForHouse(
          id,
          file.buffer,
          file.originalname,
          'photos',
        );
        return {
          url: upload.url,
          publicId: upload.publicId,
          tag: (Array.isArray(tags) ? tags[index] : undefined) || 'other',
          description: Array.isArray(descriptions) ? descriptions[index] : undefined,
          lat: gps.lat,
          lng: gps.lng,
          accuracy: gps.accuracy,
          capturedAt: gps.capturedAt ? new Date(gps.capturedAt) : new Date(),
          gpsVerified: true,
        };
      }),
    );

    return this.housesService.replaceGpsCapturedPhotos(id, user.sub, taggedPhotos);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a property listing (owner only)' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Property listing updated successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        title: 'Updated title',
        price: 16000000,
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the property owner' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateHouseDto,
  ) {
    return this.housesService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a property listing (owner only)' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Property listing deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Property listing deleted',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the property owner' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.housesService.remove(id, user.sub);
  }

  @Post(':id/pause')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Temporarily hide listing' })
  pause(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.housesService.pauseListing(id, user.sub);
  }

  @Post(':id/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Re-activate paused listing' })
  activate(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.housesService.activateListing(id, user.sub);
  }

  @Post(':id/mark-rented')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark property as rented' })
  markRented(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.housesService.markRented(id, user.sub);
  }

  @Post(':id/enquire')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Register an enquiry' })
  enquire(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.housesService.registerEnquiry(id, user.sub);
  }

  @Get(':id/contact')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reveal owner contact post-enquiry' })
  contact(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.housesService.revealContact(id, user.sub);
  }

  @Get(':id/price-comparison')
  @ApiOperation({ summary: 'Area median comparison for this listing' })
  priceComparison(@Param('id') id: string) {
    return this.housesService.getPriceComparison(id);
  }

  @Post(':id/slots/book')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Book a slot in a shared property' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Slot booked successfully',
    schema: {
      example: {
        success: true,
        message: 'Slot booked successfully',
        availableSlots: 1,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No available slots' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async bookSlot(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.housesService.bookSlot(id, user.sub);
  }

  @Post(':id/slots/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel a booked slot in a shared property' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Slot cancelled successfully',
    schema: {
      example: {
        success: true,
        message: 'Slot cancelled successfully',
        availableSlots: 2,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'User has not booked a slot' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async cancelSlot(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.housesService.cancelSlot(id, user.sub);
  }

  @Get(':id/slots/co-tenants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get co-tenants for a shared property' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'List of co-tenants',
    schema: {
      example: {
        coTenants: [
          {
            id: '64a1f2e9c...',
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+2348093117933',
            avatarUrl: 'https://example.com/avatar.jpg',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCoTenants(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.housesService.getCoTenants(id, user.sub);
  }

  @Patch(':id/viewing-fee')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update inspection fee for a property (owner only)' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        viewingFee: {
          type: 'number',
          minimum: 0,
          example: 5000,
          description: 'Inspection fee in Naira (0 to remove inspection fee)',
        },
      },
      required: ['viewingFee'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Inspection fee updated successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        viewingFee: 5000,
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the property owner' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async updateViewingFee(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: { viewingFee: number },
  ) {
    if (body.viewingFee < 0) {
      throw new BadRequestException('Inspection fee cannot be negative');
    }

    return this.housesService.updateViewingFee(id, user.sub, body.viewingFee);
  }
}
