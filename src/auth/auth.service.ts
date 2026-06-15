import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { RegisterLandlordDto } from './dto/register-landlord.dto';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { RegisterFieldVerifierDto } from './dto/register-field-verifier.dto';
import { RegisterLawFirmDto } from './dto/register-law-firm.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserDocument, UserRole } from '../users/schemas/user.schema';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { EmailService } from './email.service';
import { FlutterwaveService } from '../promotions/flutterwave.service';
import { CloudinaryService } from '../houses/cloudinary.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => FlutterwaveService))
    private readonly flutterwaveService: FlutterwaveService,
    @Inject(forwardRef(() => CloudinaryService))
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private encryptSensitiveValue(raw: string): string {
    return Buffer.from(raw, 'utf-8').toString('base64');
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async register(dto: RegisterDto) {
    const payload: CreateUserDto = {
      ...dto,
      role: dto.role ?? UserRole.Tenant,
      password: await this.hashPassword(dto.password),
    };

    const user = await this.usersService.create(payload);

    // Create virtual account for agents and landlords
    if (user.role === 'agent' || user.role === 'landlord') {
      try {
        await this.flutterwaveService.createVirtualAccount({
          account_name: user.name,
          email: user.email,
          mobilenumber: user.phone || '08000000000', // Default phone if not provided
        });
        this.logger.log(`Virtual account created for ${user.email}`);
      } catch (error: any) {
        // Don't fail registration if virtual account creation fails
        this.logger.error(`Failed to create virtual account for ${user.email}: ${error.message || error}`);
      }
    }

    // Send role-specific welcome email (don't fail registration if email fails)
    try {
      const role = user.role === 'agent' ? 'agent' : user.role === 'landlord' ? 'landlord' : 'user';
      await this.emailService.sendWelcomeEmail(user.email, user.name, role);
    } catch (error) {
      this.logger.error(`Failed to send welcome email: ${String(error)}`);
    }

    return this.buildAuthResponse(user);
  }

  async registerTenant(dto: RegisterTenantDto) {
    return this.register({
      ...dto,
      role: UserRole.Tenant,
    });
  }

  async registerLandlord(dto: RegisterLandlordDto) {
    const payload: CreateUserDto = {
      name: dto.name,
      email: dto.email,
      password: await this.hashPassword(dto.password),
      phone: dto.phone,
      bio: dto.bio,
      role: UserRole.Landlord,
    };

    const user = await this.usersService.create(payload);
    await this.usersService.updateAgentProfile(user._id.toString(), {
      bvn: dto.bvn ? this.encryptSensitiveValue(dto.bvn) : undefined,
      nin: this.encryptSensitiveValue(dto.nin),
      kycStatus: 'pending',
      kycSubmittedAt: new Date(),
    } as any);

    await this.issueEmailVerification(user._id.toString(), user.email, user.name);

    return this.buildAuthResponse(await this.usersService.findById(user._id.toString()) as UserDocument);
  }

  async issueEmailVerification(userId: string, email: string, name: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);
    await this.usersService.setEmailVerificationToken(userId, token, expires);
    try {
      await this.emailService.sendEmailVerificationEmail(email, token, name);
    } catch (error) {
      this.logger.error(`Failed to send verification email: ${String(error)}`);
    }
  }

  async verifyEmail(token: string) {
    const user = await this.usersService.findByEmailVerificationToken(token);
    if (!user) {
      throw new BadRequestException('Invalid or expired verification link');
    }
    await this.usersService.markEmailVerified(user._id.toString());
    return {
      success: true,
      message: 'Email verified successfully. You can close this page and continue in the app.',
    };
  }

  async resendEmailVerification(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.emailVerified) {
      return { success: true, message: 'Email is already verified' };
    }
    await this.issueEmailVerification(userId, user.email, user.name);
    return { success: true, message: 'Verification email sent' };
  }

  async registerAgent(dto: RegisterAgentDto) {
    return this.register({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      phone: dto.phone,
      bio: dto.bio,
      role: UserRole.Agent,
    });
  }

  async registerFieldVerifier(dto: RegisterFieldVerifierDto) {
    const payload: CreateUserDto = {
      name: dto.name,
      email: dto.email,
      password: await this.hashPassword(dto.password),
      phone: dto.phone,
      role: UserRole.FieldVerifier,
    };
    const user = await this.usersService.create(payload);
    return this.buildAuthResponse(user);
  }

  async registerCompany(dto: RegisterCompanyDto, cacDocument: Express.Multer.File) {
    // Upload CAC document to Cloudinary - use buffer + filename and a companies folder
    const uploadResult = await this.cloudinaryService.uploadToCloudinaryWithPublicId(
      cacDocument.buffer,
      cacDocument.originalname,
      'nestin-estate/companies',
    );
    const cacDocumentUrl = uploadResult.url;
    
    const payload: CreateUserDto = {
      name: dto.name,
      email: dto.email,
      password: await this.hashPassword(dto.password),
      phone: dto.phone,
      bio: dto.bio,
      role: UserRole.RealEstateCompany,
    };

    const user = await this.usersService.create(payload);
    
    // Update with company details
    await this.usersService.updateAgentProfile(user._id.toString(), {
      companyDetails: {
        ...dto.companyDetails,
        cacDocumentUrl,
      },
      companyVerificationStatus: 'pending',
    });

    // Send notification email to admin
    try {
      await this.emailService.sendEmail({
        to: process.env.ADMIN_EMAIL || 'housemedream@gmail.com',
        subject: 'New Company Registration - Verification Required',
        text: `A new real estate company has registered and requires verification.\n\nCompany: ${dto.companyDetails.companyName}\nCAC Number: ${dto.companyDetails.cacNumber}\nBusiness Email: ${dto.companyDetails.businessEmail}\n\nPlease review the CAC document and verify the company.`,
      });
    } catch (error) {
      this.logger.error(`Failed to send admin notification: ${String(error)}`);
    }

    return {
      message: 'Company registration submitted. Your account is pending verification. You will receive an email once approved.',
    };
  }

  async registerLawFirm(dto: RegisterLawFirmDto, certificateDocument: Express.Multer.File) {
    const uploadResult = await this.cloudinaryService.uploadToCloudinaryWithPublicId(
      certificateDocument.buffer,
      certificateDocument.originalname,
      'flowcheq-estate/law-firms',
    );

    const payload: CreateUserDto = {
      name: dto.name,
      email: dto.email,
      password: await this.hashPassword(dto.password),
      phone: dto.phone,
      bio: dto.bio,
      role: UserRole.Lawyer,
    };

    const user = await this.usersService.create(payload);

    await this.usersService.updateAgentProfile(user._id.toString(), {
      lawFirmDetails: {
        ...dto.lawFirmDetails,
        practicingCertificateUrl: uploadResult.url,
      },
      lawFirmVerificationStatus: 'pending',
      verified: false,
      verificationStatus: 'pending',
    } as any);

    try {
      await this.emailService.sendEmail({
        to: process.env.ADMIN_EMAIL || 'ops@estate.flowcheq.com',
        subject: 'New Law Firm Partner Registration',
        text: `A law firm partner registered and requires approval.\n\nFirm: ${dto.lawFirmDetails.firmName}\nBar ID: ${dto.lawFirmDetails.barRegistrationNumber}\nContact: ${dto.name} <${dto.email}>`,
      });
    } catch (error) {
      this.logger.error(`Failed to send law firm admin notification: ${String(error)}`);
    }

    return {
      message:
        'Law firm registration submitted. Your partner account is pending admin approval before dashboard access.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if account is banned
    if (user.accountStatus === 'banned') {
      throw new UnauthorizedException('Account has been banned. Please contact support.');
    }

    // Check if account is suspended
    if (user.accountStatus === 'suspended') {
      if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
        const reason = user.suspensionReason ? ` Reason: ${user.suspensionReason}` : '';
        throw new UnauthorizedException(
          `Account is suspended until ${new Date(user.suspendedUntil).toLocaleDateString()}.${reason}`,
        );
      } else {
        // Suspension period has passed, reactivate account
        await this.usersService.updateAgentProfile(user._id.toString(), {
          accountStatus: 'active',
          suspendedUntil: undefined,
          suspensionReason: undefined,
        });
      }
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (
      user.role === UserRole.Lawyer &&
      user.lawFirmVerificationStatus &&
      user.lawFirmVerificationStatus !== 'approved'
    ) {
      throw new UnauthorizedException(
        'Law firm account is pending admin approval. You will receive access once verified.',
      );
    }

    await this.usersService.updateLastLoginAt(user._id.toString());
    return this.buildAuthResponse(user);
  }

  async refresh(accessToken: string) {
    try {
      const decoded = await this.jwtService.verifyAsync<JwtPayload>(accessToken);
      const user = await this.usersService.findById(decoded.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }
      return this.buildAuthResponse(user);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async resendPhoneOtp(userId: string) {
    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.usersService.savePhoneOtp(userId, otp, expiresAt);
    return {
      success: true,
      message: 'OTP resent successfully',
      otp,
      expiresAt,
    };
  }

  async verifyPhone(userId: string, otp: string) {
    const isValid = await this.usersService.verifyPhoneOtp(userId, otp);
    if (!isValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    return {
      success: true,
      message: 'Phone verified successfully',
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    // Don't reveal if email exists for security reasons
    if (!user) {
      return {
        message: 'If an account with that email exists, a password reset link has been sent.',
      };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // Token expires in 1 hour

    // Save reset token to user
    await this.usersService.setResetToken(
      user.email,
      resetToken,
      resetTokenExpiry,
    );

    // Send password reset email (don't fail if email fails)
    try {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        resetToken,
        user.name,
      );
    } catch (error) {
      // Log error but don't fail the request
      // User still gets success message for security (don't reveal if email exists)
      this.logger.error(`Failed to send password reset email: ${String(error)}`);
    }

    return {
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByResetToken(dto.token);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(dto.password);

    // Update password and clear reset token
    await this.usersService.updatePassword(user._id.toString(), hashedPassword);

    return {
      message: 'Password has been reset successfully. You can now login with your new password.',
    };
  }

  private async buildAuthResponse(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const safeUser = this.usersService.toSafeUser(user);

    return {
      accessToken,
      user: safeUser,
    };
  }
}
