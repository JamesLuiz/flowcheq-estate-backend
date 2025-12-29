import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HousesService } from './houses.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { FilterHousesDto } from './dto/filter-houses.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { CloudinaryService } from './cloudinary.service';

@Controller('houses')
export class HousesController {
  constructor(
    private readonly housesService: HousesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 5))
  async create(
    @CurrentUser() user: RequestUser,
    @Body() body: any,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
        fileIsRequired: false,
      }),
    )
    files?: Express.Multer.File[],
  ) {
    // Parse form data fields (they come as strings in multipart/form-data)
    const dto: CreateHouseDto = {
      title: body.title,
      description: body.description,
      price: Number(body.price),
      location: body.location,
      type: body.type,
      bedrooms: body.bedrooms ? Number(body.bedrooms) : undefined,
      bathrooms: body.bathrooms ? Number(body.bathrooms) : undefined,
      area: body.area ? Number(body.area) : undefined,
      featured: body.featured === 'true' || body.featured === true,
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
      if (files.length < 3 || files.length > 5) {
        throw new BadRequestException('You must upload between 3 and 5 images');
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

    return this.housesService.create(user.sub, {
      ...dto,
      images: imageUrls,
    });
  }

  @Get()
  findAll(@Query() filters: FilterHousesDto) {
    return this.housesService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.housesService.findOne(id, true);
  }

  @Post(':id/view')
  trackView(@Param('id') id: string) {
    return this.housesService.trackView(id);
  }

  @Post(':id/whatsapp-click')
  trackWhatsAppClick(@Param('id') id: string) {
    return this.housesService.trackWhatsAppClick(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateHouseDto,
  ) {
    return this.housesService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.housesService.remove(id, user.sub);
  }

  @Get('stats/me')
  @UseGuards(JwtAuthGuard)
  getStats(@CurrentUser() user: RequestUser) {
    return this.housesService.getStats(user.sub);
  }
}
