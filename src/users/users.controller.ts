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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { HousesService } from '../houses/houses.service';
import { UpdateAgentProfileDto } from './dto/update-agent-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from './schemas/user.schema';
import { CloudinaryService } from '../houses/cloudinary.service';
import { FlutterwaveService } from '../promotions/flutterwave.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

@Controller('agents')
@ApiTags('Agents')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => HousesService))
    private readonly housesService: HousesService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => FlutterwaveService))
    private readonly flutterwaveService: FlutterwaveService,
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
  @ApiResponse({
    status: 200,
    description: 'Updated agent profile',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        name: 'Eliezer James',
        email: 'jameseliezer116@gmail.com',
        phone: '+2348093117933',
        bio: 'Updated bio',
        avatarUrl: 'https://example.com/avatar.jpg',
        verified: true,
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAgentProfileDto,
  ) {
    return this.usersService.updateAgentProfile(user.sub, dto);
  }

  @Get('me/bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get bank account details' })
  async getBankAccount(@CurrentUser() user: RequestUser) {
    const agent = await this.usersService.findById(user.sub);
    if (!agent) {
      throw new NotFoundException('User not found');
    }
    return {
      bankAccount: (agent as any).bankAccount || null,
      walletBalance: (agent as any).walletBalance || 0,
    };
  }

  @Patch('me/bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update bank account details' })
  @ApiResponse({
    status: 200,
    description: 'Updated bank account',
  })
  async updateBankAccount(
    @CurrentUser() user: RequestUser,
    @Body() dto: { bankAccount: { bankName: string; accountNumber: string; accountName: string; bankCode: string } },
  ) {
    return this.usersService.updateAgentProfile(user.sub, { bankAccount: dto.bankAccount } as any);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload avatar for authenticated user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (jpg, jpeg, png, webp, max 5MB)',
        },
      },
      required: ['avatar'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Updated profile with avatarUrl',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        name: 'Eliezer James',
        email: 'jameseliezer116@gmail.com',
        avatarUrl: 'https://res.cloudinary.com/.../avatar.jpg',
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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

  @Post('me/withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Withdraw funds from wallet to bank account' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          minimum: 100,
          example: 1000,
          description: 'Amount to withdraw (minimum 100 NGN)',
        },
      },
      required: ['amount'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Withdrawal initiated successfully',
    schema: {
      example: {
        success: true,
        transferId: '123456',
        reference: 'TRF-1234567890-abc',
        status: 'NEW',
        amount: 1000,
        message: 'Withdrawal request submitted successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - insufficient balance or invalid amount' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - bank account not configured' })
  async withdrawFunds(
    @CurrentUser() user: RequestUser,
    @Body() body: { amount: number },
  ) {
    const agent = await this.usersService.findById(user.sub);
    if (!agent) {
      throw new NotFoundException('User not found');
    }

    if (agent.role !== 'agent' && agent.role !== 'landlord') {
      throw new ForbiddenException('Only agents and landlords can withdraw funds');
    }

    const bankAccount = (agent as any).bankAccount;
    if (!bankAccount || !bankAccount.accountNumber || !bankAccount.bankCode) {
      throw new ForbiddenException('Bank account not configured. Please set up your bank account first.');
    }

    const walletBalance = (agent as any).walletBalance || 0;
    if (walletBalance < body.amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    if (body.amount < 100) {
      throw new BadRequestException('Minimum withdrawal amount is 100 NGN');
    }

    try {
      // Initiate transfer via Flutterwave
      const transferResult = await this.flutterwaveService.initiateTransfer({
        account_bank: bankAccount.bankCode,
        account_number: bankAccount.accountNumber,
        amount: body.amount,
        narration: `Withdrawal for ${agent.name}`,
        beneficiary_name: bankAccount.accountName || agent.name,
      });

      // Deduct from wallet (optimistic - in production, you might want to wait for webhook confirmation)
      await this.usersService.deductFromWalletBalance(user.sub, body.amount);

      return {
        ...transferResult,
        message: 'Withdrawal request submitted successfully. Funds will be transferred to your bank account.',
      };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to process withdrawal');
    }
  }
}
