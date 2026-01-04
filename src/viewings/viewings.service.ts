import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Viewing, ViewingDocument } from './schemas/viewing.schema';
import { Settings, SettingsDocument } from '../admin/schemas/settings.schema';
import { UsersService } from '../users/users.service';
import { HousesService } from '../houses/houses.service';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../houses/cloudinary.service';
import { FlutterwaveService } from '../promotions/flutterwave.service';

@Injectable()
export class ViewingsService {
  constructor(
    @InjectModel(Viewing.name) private viewingModel: Model<ViewingDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    private usersService: UsersService,
    private housesService: HousesService,
    private configService: ConfigService,
    private cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => FlutterwaveService))
    private flutterwaveService: FlutterwaveService,
  ) {}

  async schedule(dto: {
    houseId: string;
    agentId: string;
    scheduledDate: string;
    scheduledTime: string;
    notes?: string;
    userId?: string;
    name?: string;
    email?: string;
    phone?: string;
  }) {
    const house = await this.housesService.findOne(dto.houseId);
    if (!house) {
      throw new NotFoundException('Property not found');
    }

    const agent = await this.usersService.findById(dto.agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // Get viewing fee from house if set
    const viewingFee = (house as any).viewingFee || 0;

    const viewing = new this.viewingModel({
      houseId: new Types.ObjectId(dto.houseId),
      agentId: new Types.ObjectId(dto.agentId),
      userId: dto.userId ? new Types.ObjectId(dto.userId) : undefined,
      scheduledDate: dto.scheduledDate,
      scheduledTime: dto.scheduledTime,
      notes: dto.notes,
      guestName: dto.name,
      guestEmail: dto.email,
      guestPhone: dto.phone,
      status: 'pending',
      viewingFee: viewingFee > 0 ? viewingFee : undefined,
      paymentStatus: viewingFee > 0 ? 'unpaid' : undefined,
    });

    const saved = await viewing.save();

    // Send email notifications
    await this.sendNotifications(saved, house, agent, dto);

    return this.toResponse(saved);
  }

  private async sendNotifications(viewing: ViewingDocument, house: any, agent: any, dto: any) {
    const nodemailer = await import('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST') || 'smtp.gmail.com',
      port: parseInt(this.configService.get('SMTP_PORT') || '587'),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });

    const clientName = dto.name || 'A client';
    const clientEmail = dto.email || 'Not provided';
    const clientPhone = dto.phone || 'Not provided';

    // Email to agent/landlord
    const agentEmailContent = `
      <h2>New Viewing Request</h2>
      <p>You have a new viewing request for your property:</p>
      <h3>${house.title}</h3>
      <p><strong>Location:</strong> ${house.location}</p>
      <hr>
      <h4>Viewing Details:</h4>
      <ul>
        <li><strong>Date:</strong> ${dto.scheduledDate}</li>
        <li><strong>Time:</strong> ${dto.scheduledTime}</li>
        <li><strong>Client Name:</strong> ${clientName}</li>
        <li><strong>Client Email:</strong> ${clientEmail}</li>
        <li><strong>Client Phone:</strong> ${clientPhone}</li>
      </ul>
      ${dto.notes ? `<p><strong>Notes:</strong> ${dto.notes}</p>` : ''}
      <p>Please log in to your dashboard to confirm or reschedule this viewing.</p>
    `;

    // Email to client
    const clientEmailContent = `
      <h2>Viewing Request Submitted</h2>
      <p>Your viewing request has been submitted successfully!</p>
      <h3>${house.title}</h3>
      <p><strong>Location:</strong> ${house.location}</p>
      <hr>
      <h4>Requested Details:</h4>
      <ul>
        <li><strong>Date:</strong> ${dto.scheduledDate}</li>
        <li><strong>Time:</strong> ${dto.scheduledTime}</li>
        <li><strong>Agent:</strong> ${agent.name}</li>
      </ul>
      <p>The agent will confirm your viewing request shortly. You'll receive an email when confirmed.</p>
    `;

    // Admin notification
    const adminEmail = this.configService.get('ADMIN_EMAIL');
    const adminEmailContent = `
      <h2>New Viewing Scheduled</h2>
      <p>A new property viewing has been scheduled:</p>
      <h3>${house.title}</h3>
      <ul>
        <li><strong>Property:</strong> ${house.title}</li>
        <li><strong>Location:</strong> ${house.location}</li>
        <li><strong>Agent:</strong> ${agent.name} (${agent.email})</li>
        <li><strong>Client:</strong> ${clientName} (${clientEmail})</li>
        <li><strong>Date:</strong> ${dto.scheduledDate}</li>
        <li><strong>Time:</strong> ${dto.scheduledTime}</li>
      </ul>
    `;

    try {
      // Send to agent
      if (agent.email) {
        await transporter.sendMail({
          from: this.configService.get('SMTP_FROM') || 'noreply@nestinestate.com',
          to: agent.email,
          subject: `New Viewing Request - ${house.title}`,
          html: agentEmailContent,
        });
      }

      // Send to client
      if (dto.email) {
        await transporter.sendMail({
          from: this.configService.get('SMTP_FROM') || 'noreply@nestinestate.com',
          to: dto.email,
          subject: `Viewing Request Submitted - ${house.title}`,
          html: clientEmailContent,
        });
      }

      // Send to admin
      if (adminEmail) {
        await transporter.sendMail({
          from: this.configService.get('SMTP_FROM') || 'noreply@nestinestate.com',
          to: adminEmail,
          subject: `[Admin] New Viewing Scheduled - ${house.title}`,
          html: adminEmailContent,
        });
      }
    } catch (error) {
      console.error('Failed to send viewing notification emails:', error);
    }
  }

  async getAgentViewings(agentId: string) {
    const viewings = await this.viewingModel
      .find({ agentId: new Types.ObjectId(agentId), deleted: { $ne: true } })
      .populate('houseId', 'title location images price')
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .exec();

    return viewings.map(v => this.toResponse(v));
  }

  async getAllViewings() {
    const viewings = await this.viewingModel
      .find({ deleted: { $ne: true } })
      .populate('houseId', 'title location images price')
      .populate('userId', 'name email phone')
      .populate('agentId', 'name email phone role')
      .sort({ createdAt: -1 })
      .exec();

    return viewings.map(v => this.toResponse(v));
  }

  async updateStatus(viewingId: string, agentId: string, status: string, isAdmin = false) {
    const viewing = await this.viewingModel
      .findById(viewingId)
      .populate('houseId', 'title location')
      .populate('userId', 'name email')
      .populate('agentId', 'name email')
      .exec();

    if (!viewing) {
      throw new NotFoundException('Viewing not found');
    }

    if (!isAdmin && viewing.agentId.toString() !== agentId) {
      throw new ForbiddenException('Not authorized to update this viewing');
    }

    viewing.status = status;
    await viewing.save();

    // Send status update emails
    await this.sendStatusUpdateEmail(viewing, status);

    return this.toResponse(viewing);
  }

  private async sendStatusUpdateEmail(viewing: ViewingDocument, status: string) {
    const nodemailer = await import('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST') || 'smtp.gmail.com',
      port: parseInt(this.configService.get('SMTP_PORT') || '587'),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });

    const house = viewing.houseId as any;
    const clientEmail = (viewing.userId as any)?.email || viewing.guestEmail;
    const clientName = (viewing.userId as any)?.name || viewing.guestName;

    if (!clientEmail) return;

    const statusMessages: Record<string, string> = {
      confirmed: 'Your viewing has been confirmed! The agent is expecting you.',
      cancelled: 'Unfortunately, your viewing request has been cancelled.',
      completed: 'Thank you for viewing the property! We hope you found what you were looking for.',
    };

    const emailContent = `
      <h2>Viewing ${status.charAt(0).toUpperCase() + status.slice(1)}</h2>
      <p>Hi ${clientName || 'there'},</p>
      <p>${statusMessages[status] || `Your viewing status has been updated to: ${status}`}</p>
      <h3>${house?.title || 'Property'}</h3>
      <ul>
        <li><strong>Date:</strong> ${viewing.scheduledDate}</li>
        <li><strong>Time:</strong> ${viewing.scheduledTime}</li>
      </ul>
    `;

    try {
      await transporter.sendMail({
        from: this.configService.get('SMTP_FROM') || 'noreply@nestinestate.com',
        to: clientEmail,
        subject: `Viewing ${status.charAt(0).toUpperCase() + status.slice(1)} - ${house?.title || 'Property'}`,
        html: emailContent,
      });
    } catch (error) {
      console.error('Failed to send status update email:', error);
    }
  }

  async uploadReceipt(viewingId: string, userId: string, file: Express.Multer.File, isAdmin = false) {
    const viewing = await this.viewingModel.findById(viewingId).exec();

    if (!viewing) {
      throw new NotFoundException('Viewing not found');
    }

    // Check permissions: user must be the one who scheduled, or admin, or agent
    const isViewingOwner = viewing.userId?.toString() === userId;
    const isViewingAgent = viewing.agentId.toString() === userId;

    if (!isAdmin && !isViewingOwner && !isViewingAgent) {
      throw new ForbiddenException('Not authorized to upload receipt for this viewing');
    }

    // Upload receipt to Cloudinary
    const receiptUrl = await this.cloudinaryService.uploadToCloudinary(
      file.buffer,
      `receipt-${viewingId}-${Date.now()}`,
    );

    // Update viewing with receipt URL
    viewing.receiptUrl = receiptUrl;
    await viewing.save();

    return this.toResponse(viewing);
  }

  async initializeViewingPayment(viewingId: string, userId: string) {
    const viewing = await this.viewingModel
      .findById(viewingId)
      .populate('houseId')
      .populate('userId')
      .populate('agentId')
      .exec();

    if (!viewing) {
      throw new NotFoundException('Viewing not found');
    }

    // Check if user is authorized (must be the one who scheduled)
    const isViewingOwner = viewing.userId?.toString() === userId || viewing.guestEmail;
    if (!isViewingOwner) {
      throw new ForbiddenException('Not authorized to pay for this viewing');
    }

    // Check if viewing fee is set
    if (!viewing.viewingFee || viewing.viewingFee <= 0) {
      throw new ForbiddenException('No viewing fee set for this property');
    }

    // Check if already paid
    if (viewing.paymentStatus === 'paid') {
      throw new ForbiddenException('Viewing fee already paid');
    }

    const house = viewing.houseId as any;
    const user = viewing.userId as any;
    const agent = viewing.agentId as any;

    const customerEmail = user?.email || viewing.guestEmail;
    const customerName = user?.name || viewing.guestName || 'Guest';
    const customerPhone = user?.phone || viewing.guestPhone;

    const txRef = `VIEWING-${viewingId}-${Date.now()}`;
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const callbackUrl = `${frontendUrl}/viewings/payment/callback?tx_ref=${txRef}`;

    try {
      const paymentResult = await this.flutterwaveService.initializePayment({
        amount: viewing.viewingFee,
        email: customerEmail,
        name: customerName,
        phone: customerPhone,
        tx_ref: txRef,
        callback_url: callbackUrl,
        meta: {
          viewingId: viewingId,
          houseId: house._id?.toString() || house.id,
          agentId: agent._id?.toString() || agent.id,
        },
      });

      // Update viewing with payment reference
      viewing.paymentReference = txRef;
      viewing.paymentStatus = 'pending';
      await viewing.save();

      return paymentResult;
    } catch (error: any) {
      throw new Error(`Failed to initialize payment: ${error.message}`);
    }
  }

  async verifyViewingPayment(txRef: string, userId: string) {
    const viewing = await this.viewingModel
      .findOne({ paymentReference: txRef })
      .populate('agentId')
      .exec();

    if (!viewing) {
      throw new NotFoundException('Viewing not found');
    }

    // Verify payment with Flutterwave
    const verification = await this.flutterwaveService.verifyPayment(txRef);

    if (!verification.success) {
      viewing.paymentStatus = 'failed';
      await viewing.save();
      throw new Error('Payment verification failed');
    }

    // Check if already processed
    if (viewing.paymentStatus === 'paid') {
      return this.toResponse(viewing);
    }

    // Calculate fees (get from database or env variable)
    let platformFeePercentage = parseFloat(
      this.configService.get<string>('VIEWING_FEE_PERCENTAGE') || '10',
    );
    
    // Try to get from database settings
    try {
      const settings = await this.settingsModel.findOne({ key: 'platformFeePercentage' });
      if (settings && typeof settings.value === 'number') {
        platformFeePercentage = settings.value;
      }
    } catch (error) {
      // If Settings model not available, use env variable
    }
    const platformFee = (viewing.viewingFee! * platformFeePercentage) / 100;
    const agentAmount = viewing.viewingFee! - platformFee;

    // Update viewing with payment details
    viewing.paymentStatus = 'paid';
    viewing.amountPaid = viewing.viewingFee!;
    viewing.platformFee = platformFeePercentage;
    viewing.agentAmount = agentAmount;
    await viewing.save();

    // Add to agent's wallet balance
    const agent = await this.usersService.findById(viewing.agentId.toString());
    if (agent) {
      await this.usersService.addToWalletBalance(viewing.agentId.toString(), agentAmount);
    }

    return this.toResponse(viewing);
  }

  private toResponse(viewing: ViewingDocument) {
    const obj = viewing.toObject ? viewing.toObject() : viewing;
    return {
      id: obj._id?.toString() || obj.id,
      houseId: obj.houseId,
      userId: obj.userId || {
        name: obj.guestName,
        email: obj.guestEmail,
        phone: obj.guestPhone,
      },
      agentId: obj.agentId,
      scheduledDate: obj.scheduledDate,
      scheduledTime: obj.scheduledTime,
      status: obj.status,
      notes: obj.notes,
      createdAt: obj.createdAt,
      viewingFee: obj.viewingFee,
      paymentStatus: obj.paymentStatus,
      paymentReference: obj.paymentReference,
      receiptUrl: obj.receiptUrl,
      amountPaid: obj.amountPaid,
      platformFee: obj.platformFee,
      agentAmount: obj.agentAmount,
    };
  }
}
