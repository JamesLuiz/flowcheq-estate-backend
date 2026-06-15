import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { RegisterLandlordDto } from './dto/register-landlord.dto';
import { RegisterFieldVerifierDto } from './dto/register-field-verifier.dto';
import { RegisterLawFirmDto } from './dto/register-law-firm.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyPhoneDto } from './dto/verify-phone.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
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

  @Post('register/tenant')
  @ApiOperation({ summary: 'Register as a tenant' })
  @ApiResponse({ status: 201, description: 'Tenant registered successfully' })
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.authService.registerTenant(dto);
  }

  @Post('register/landlord')
  @ApiOperation({ summary: 'Register as an individual landlord' })
  @ApiResponse({ status: 201, description: 'Landlord registered successfully' })
  registerLandlord(@Body() dto: RegisterLandlordDto) {
    return this.authService.registerLandlord(dto);
  }

  @Post('register/agent')
  @ApiOperation({ summary: 'Register as a property agent (manages listings, cannot create them)' })
  @ApiResponse({ status: 201, description: 'Agent registered successfully' })
  registerAgent(@Body() dto: RegisterAgentDto) {
    return this.authService.registerAgent(dto);
  }

  @Post('register/field-verifier')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a field verifier account (admin only)' })
  @ApiResponse({ status: 201, description: 'Field verifier account created' })
  registerFieldVerifier(
    @CurrentUser() user: RequestUser,
    @Body() dto: RegisterFieldVerifierDto,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can create field verifiers');
    }
    return this.authService.registerFieldVerifier(dto);
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

  @Post('register-law-firm')
  @UseInterceptors(FileInterceptor('practicingCertificate'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Register a partner law firm for listing legal review' })
  @ApiResponse({ status: 201, description: 'Law firm registration submitted for admin approval' })
  async registerLawFirm(
    @Body('data') dataString: string,
    @UploadedFile() practicingCertificate: Express.Multer.File,
  ) {
    if (!dataString) {
      throw new BadRequestException('Registration data is required');
    }
    if (!practicingCertificate) {
      throw new BadRequestException('Practicing certificate document is required');
    }

    let dto: RegisterLawFirmDto;
    try {
      dto = JSON.parse(dataString);
    } catch {
      throw new BadRequestException('Invalid registration data format');
    }

    return this.authService.registerLawFirm(dto, practicingCertificate);
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

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email from link in inbox' })
  verifyEmail(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }
    return this.authService.verifyEmail(token);
  }

  @Post('resend-email-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Resend email verification link' })
  resendEmailVerification(@CurrentUser() user: RequestUser) {
    return this.authService.resendEmailVerification(user.sub);
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

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate access token (refresh flow)' })
  @ApiResponse({ status: 200, description: 'New token issued' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.accessToken);
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

  @Post('verify-phone')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Submit OTP for phone verification' })
  @ApiResponse({
    status: 200,
    description: 'Phone verification successful',
    schema: {
      example: {
        success: true,
        message: 'Phone verified successfully',
      },
    },
  })
  verifyPhone(@CurrentUser() user: RequestUser, @Body() dto: VerifyPhoneDto) {
    return this.authService.verifyPhone(user.sub, dto.otp);
  }

  @Post('resend-otp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Resend phone verification OTP' })
  @ApiResponse({ status: 200, description: 'OTP resent successfully' })
  resendOtp(@CurrentUser() user: RequestUser) {
    return this.authService.resendPhoneOtp(user.sub);
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
