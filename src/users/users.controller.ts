import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  forwardRef,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { HousesService } from '../houses/houses.service';
import { UpdateAgentProfileDto } from './dto/update-agent-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from './schemas/user.schema';
import { CloudinaryService } from '../houses/cloudinary.service';

@Controller('agents')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => HousesService))
    private readonly housesService: HousesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  async listAgents(
    @Query('limit') limit = '20',
    @Query('verified') verified?: string,
  ) {
    const parsedLimit = Number(limit) || 20;
    const filter: any = {};
    
    if (verified !== undefined) {
      filter.verified = verified === 'true';
    }
    
    const agents = await this.usersService.findAgents(filter, { limit: parsedLimit });

    return {
      data: agents.map((agent) => this.usersService.toSafeUser(agent)),
    };
  }

  @Get(':id')
  async getAgentProfile(@Param('id') id: string) {
    const agent = await this.usersService.findById(id);
    if (!agent || (agent.role !== UserRole.Agent && agent.role !== UserRole.Landlord)) {
      throw new NotFoundException('Agent or landlord not found');
    }

    const listings = await this.housesService.findByAgent(id);

    return {
      agent: this.usersService.toSafeUser(agent),
      listings,
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAgentProfileDto,
  ) {
    return this.usersService.updateAgentProfile(user.sub, dto);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const avatarUrl = await this.cloudinaryService.uploadToCloudinary(
      file.buffer,
      `avatar-${user.sub}-${Date.now()}`,
    );

    return this.usersService.updateAgentProfile(user.sub, { avatarUrl });
  }
}
