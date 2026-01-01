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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
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
@ApiTags('Agents')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => HousesService))
    private readonly housesService: HousesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List agents' })
  @ApiResponse({
    status: 200,
    description: 'List of agent profiles',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            name: 'Eliezer James',
            email: 'jameseliezer116@gmail.com',
            role: 'agent',
            verified: true,
            avatarUrl: 'https://example.com/avatar.jpg'
          }
        ]
      }
    }
  })
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
  @ApiOperation({ summary: 'Get agent profile and listings' })
  @ApiResponse({
    status: 200,
    description: 'Agent profile with listings',
    schema: {
      example: {
        agent: {
          _id: '64a1f2e9c...',
          name: 'Eliezer James',
          email: 'jameseliezer116@gmail.com',
          role: 'agent',
          verified: true,
        },
        listings: [
          {
            _id: '640c1b2a9c...',
            title: '3 bedroom flat in Lekki',
            price: 15000000,
            location: 'Lekki, Lagos'
          }
        ]
      }
    }
  })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update authenticated agent profile' })
  @ApiResponse({ status: 200, description: 'Updated agent profile' })
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAgentProfileDto,
  ) {
    return this.usersService.updateAgentProfile(user.sub, dto);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload avatar for authenticated user' })
  @ApiResponse({ status: 200, description: 'Updated profile with avatarUrl' })
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
