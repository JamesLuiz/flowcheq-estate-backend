import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Controller('users')
@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class UsersProfileController {
  constructor(private readonly usersService: UsersService) {}

  private ensureTenant(user: RequestUser) {
    if (user.role !== 'tenant') {
      throw new ForbiddenException('Tenant access required');
    }
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get own full profile (tenant)' })
  @ApiResponse({ status: 200, description: 'User profile returned' })
  async getProfile(@CurrentUser() user: RequestUser) {
    this.ensureTenant(user);
    const profile = await this.usersService.findById(user.sub);
    return profile ? this.usersService.toSafeUser(profile) : null;
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update own profile details (tenant)' })
  @ApiResponse({ status: 200, description: 'User profile updated' })
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateUserProfileDto,
  ) {
    this.ensureTenant(user);
    return this.usersService.updateUserProfile(user.sub, dto);
  }

  @Get('saved-properties')
  @ApiOperation({ summary: 'List saved/bookmarked properties' })
  @ApiResponse({ status: 200, description: 'Saved properties list returned' })
  async getSavedProperties(@CurrentUser() user: RequestUser) {
    this.ensureTenant(user);
    const savedProperties = await this.usersService.getSavedProperties(user.sub);
    return { savedProperties };
  }

  @Post('saved-properties/:propertyId')
  @ApiOperation({ summary: 'Save/bookmark a property' })
  @ApiResponse({ status: 200, description: 'Property saved' })
  async saveProperty(
    @CurrentUser() user: RequestUser,
    @Param('propertyId') propertyId: string,
  ) {
    this.ensureTenant(user);
    const savedProperties = await this.usersService.saveProperty(
      user.sub,
      propertyId,
    );
    return { savedProperties };
  }

  @Delete('saved-properties/:propertyId')
  @ApiOperation({ summary: 'Remove a saved property' })
  @ApiResponse({ status: 200, description: 'Property removed from saved list' })
  async removeSavedProperty(
    @CurrentUser() user: RequestUser,
    @Param('propertyId') propertyId: string,
  ) {
    this.ensureTenant(user);
    const savedProperties = await this.usersService.removeSavedProperty(
      user.sub,
      propertyId,
    );
    return { savedProperties };
  }

  @Post('nestin-id/verify')
  @ApiOperation({ summary: 'Submit docs for Nestin ID verification' })
  @ApiResponse({
    status: 200,
    description: 'Nestin ID verification submitted',
    schema: {
      example: {
        success: true,
        message: 'Nestin ID verification submitted',
      },
    },
  })
  async submitNestinIdVerification(@CurrentUser() user: RequestUser) {
    this.ensureTenant(user);
    await this.usersService.setNestinIdVerificationStatus(user.sub, false);
    return {
      success: true,
      message: 'Nestin ID verification submitted',
    };
  }

  @Get('nestin-id/status')
  @ApiOperation({ summary: 'Check Nestin ID verification status' })
  @ApiResponse({ status: 200, description: 'Nestin ID status returned' })
  async getNestinIdStatus(@CurrentUser() user: RequestUser) {
    this.ensureTenant(user);
    const profile = await this.usersService.findById(user.sub);
    return {
      nestinIdVerified: profile?.nestinIdVerified ?? false,
      nestinIdVerifiedAt: profile?.nestinIdVerifiedAt ?? null,
    };
  }
}
