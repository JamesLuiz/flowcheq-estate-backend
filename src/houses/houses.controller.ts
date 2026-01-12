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
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { HousesService } from './houses.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { FilterHousesDto } from './dto/filter-houses.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CloudinaryService } from './cloudinary.service';

@Controller('houses')
@ApiTags('Houses')
export class HousesController {
  constructor(
    private readonly housesService: HousesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 5))
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
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    // Log received data for debugging
    console.log('Received house creation request:', {
      title: body.title,
      description: body.description?.substring(0, 50) + '...',
      price: body.price,
      location: body.location,
      type: body.type,
      filesCount: files?.length || 0,
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

    // Upload files to Cloudinary if provided
    if (files && files.length > 0) {
      // Log each file's metadata for debugging
      files.forEach((file, idx) => {
        console.log(`Received file[${idx}]: name=${file.originalname}, mimetype=${file.mimetype}, size=${file.size}`);
      });

      if (files.length < 3 || files.length > 5) {
        throw new BadRequestException('You must upload between 3 and 5 images');
      }

      // Additional safety: ensure all files are images and within size
      const maxSize = 5 * 1024 * 1024; // 5MB
      const allowedPrefix = /^image\//i;
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/pjpeg', 'image/x-png'];

      for (const file of files) {
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

      const uploadPromises = files.map((file) =>
        this.cloudinaryService.uploadToCloudinary(
          file.buffer,
          file.originalname,
        ),
      );
      imageUrls = await Promise.all(uploadPromises);
    } else if (body.images) {
      // Fallback to URL strings if provided
      imageUrls = Array.isArray(body.images)
        ? body.images
        : body.images.split(',').map((url: string) => url.trim()).filter(Boolean);
    }

    try {
      return await this.housesService.create(user.sub, {
        ...dto,
        images: imageUrls,
      });
    } catch (error: any) {
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

  @Get()
  @ApiOperation({ summary: 'Get all property listings with optional filters' })
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
  @ApiOperation({ summary: 'Track a view on a property listing' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'View tracked successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        viewCount: 11,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  trackView(@Param('id') id: string) {
    return this.housesService.trackView(id);
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
        totalWhatsAppClicks: 50,
        featuredListings: 2,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getStats(@CurrentUser() user: RequestUser) {
    return this.housesService.getStats(user.sub);
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
  @ApiOperation({ summary: 'Update viewing fee for a property (owner only)' })
  @ApiParam({ name: 'id', description: 'Property ID', example: '64a1f2e9c...' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        viewingFee: {
          type: 'number',
          minimum: 0,
          example: 5000,
          description: 'Viewing fee in Naira (0 to remove viewing fee)',
        },
      },
      required: ['viewingFee'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Viewing fee updated successfully',
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
      throw new BadRequestException('Viewing fee cannot be negative');
    }

    return this.housesService.updateViewingFee(id, user.sub, body.viewingFee);
  }
}
