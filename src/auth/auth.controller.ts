import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { type RequestUser } from './decorators/current-user.decorator';
import { UsersService } from '../users/users.service';

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered and token returned',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          _id: '64a1f2e9c...',
          name: 'Eliezer James',
          email: 'jameseliezer116@gmail.com',
          role: 'user',
          verified: false,
          phone: '+2348093117933',
          bio: 'Real estate agent in Lagos',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 409, description: 'Conflict - user already exists' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register-company')
  @UseInterceptors(FileInterceptor('cacDocument'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Register a new real estate company' })
  @ApiResponse({
    status: 201,
    description: 'Company registration submitted for verification',
    schema: {
      example: {
        message: 'Company registration submitted. Your account is pending verification.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 409, description: 'Conflict - user already exists' })
  async registerCompany(
    @Body('data') dataString: string,
    @UploadedFile() cacDocument: Express.Multer.File,
  ) {
    if (!dataString) {
      throw new BadRequestException('Registration data is required');
    }
    
    if (!cacDocument) {
      throw new BadRequestException('CAC document is required');
    }
    
    let dto: RegisterCompanyDto;
    try {
      dto = JSON.parse(dataString);
    } catch {
      throw new BadRequestException('Invalid registration data format');
    }
    
    return this.authService.registerCompany(dto, cacDocument);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Returns accessToken and user',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          _id: '64a1f2e9c...',
          name: 'Eliezer James',
          email: 'jameseliezer116@gmail.com',
          role: 'user',
          verified: true,
          phone: '+2348093117933',
          bio: 'Real estate agent in Lagos',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout (client-side token removal)' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    schema: {
      example: {
        success: true,
      },
    },
  })
  logout() {
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        name: 'Eliezer James',
        email: 'jameseliezer116@gmail.com',
        role: 'user',
        verified: true,
        phone: '+2348093117933',
        bio: 'Real estate agent in Lagos',
        avatarUrl: 'https://example.com/avatar.jpg',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async me(@CurrentUser() user: RequestUser) {
    const me = await this.usersService.findById(user.sub);
    if (!me) {
      return null;
    }

    return this.usersService.toSafeUser(me);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email queued (if user exists)',
    schema: {
      example: {
        message: 'If an account with that email exists, a password reset link has been sent.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
    schema: {
      example: {
        message: 'Password reset successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error or invalid token' })
  @ApiResponse({ status: 404, description: 'Invalid or expired reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
