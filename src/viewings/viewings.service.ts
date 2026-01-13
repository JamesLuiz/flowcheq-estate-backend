import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Viewing, ViewingDocument } from './schemas/viewing.schema';
import { Settings, SettingsDocument } from '../admin/schemas/settings.schema';
import { UsersService } from '../users/users.service';
import { HousesService } from '../houses/houses.service';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../houses/cloudinary.service';
import { FlutterwaveService } from '../promotions/flutterwave.service';
import { EmailService } from '../auth/email.service';

@Injectable()
export class ViewingsService {
  private readonly logger = new Logger(ViewingsService.name);
  constructor(
    @InjectModel(Viewing.name) private viewingModel: Model<ViewingDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    private usersService: UsersService,
    private housesService: HousesService,
    private configService: ConfigService,
    private cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => FlutterwaveService))
    private flutterwaveService: FlutterwaveService,
    @Inject(forwardRef(() => EmailService))
    private emailService: EmailService,
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
    // Only show viewings that are paid (if they have a viewing fee) or free viewings
    // Logic: 
    // - Free viewings: viewingFee doesn't exist, is 0, or is null
    // - Paid viewings: viewingFee > 0 AND paymentStatus = 'paid'
    // Unpaid viewings with viewingFee > 0 will NOT be shown
    const viewings = await this.viewingModel
      .find({ 
        agentId: new Types.ObjectId(agentId), 
        deleted: { $ne: true },
        $or: [
          // Free viewings (no fee required)
          { viewingFee: { $exists: false } },
          { viewingFee: 0 },
          { viewingFee: null },
          // Paid viewings (fee required and payment confirmed)
          { 
            viewingFee: { $gt: 0 },
            paymentStatus: 'paid'
          },
        ],
      })
      .populate('houseId', 'title location images price')
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .exec();

    return viewings.map(v => this.toResponse(v));
  }

  async getUserViewings(userId: string) {
    // Get user to check their email (in case viewings were created with guestEmail)
    const user = await this.usersService.findById(userId);
    const userEmail = user?.email?.toLowerCase();

    // Query viewings by userId OR by guestEmail (for logged-in users who scheduled as guests)
    const query: any = {
      deleted: { $ne: true },
      $or: [
        { userId: new Types.ObjectId(userId) },
      ],
    };

    // Also include viewings created with guestEmail if user is logged in
    if (userEmail) {
      query.$or.push({ guestEmail: userEmail.toLowerCase() });
    }

    const viewings = await this.viewingModel
      .find(query)
      .populate('houseId', 'title location images price')
      .populate('agentId', 'name email phone')
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

  async updateStatus(viewingId: string, userId: string, status: string, isAdmin = false, newDate?: string, newTime?: string) {
    const viewing = await this.viewingModel
      .findById(viewingId)
      .populate('houseId', 'title location')
      .populate('userId', 'name email')
      .populate('agentId', 'name email')
      .exec();

    if (!viewing) {
      throw new NotFoundException('Viewing not found');
    }

    // Check if user is the agent/landlord for this viewing
    const viewingAgentId = (viewing.agentId as any)?._id?.toString() || viewing.agentId?.toString();
    const isViewingAgent = viewingAgentId === userId;
    
    if (!isAdmin && !isViewingAgent) {
      throw new ForbiddenException('Not authorized to update this viewing');
    }

    // Handle reschedule
    if (status === 'rescheduled' && newDate && newTime) {
      viewing.scheduledDate = newDate;
      viewing.scheduledTime = newTime;
      viewing.status = 'pending'; // Reset to pending when rescheduled
      await viewing.save();
      await this.sendRescheduleEmail(viewing, newDate, newTime);
      return this.toResponse(viewing);
    }

    viewing.status = status;
    await viewing.save();

    // Send status update emails
    await this.sendStatusUpdateEmail(viewing, status);

    return this.toResponse(viewing);
  }

  private async sendRescheduleEmail(viewing: ViewingDocument, newDate: string, newTime: string) {
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
    const agentName = (viewing.agentId as any)?.name || 'The agent';

    if (!clientEmail) return;

    const emailContent = `
      <h2>Viewing Rescheduled</h2>
      <p>Hi ${clientName || 'there'},</p>
      <p>${agentName} has rescheduled your property viewing.</p>
      <h3>${house?.title || 'Property'}</h3>
      <h4>New Schedule:</h4>
      <ul>
        <li><strong>Date:</strong> ${newDate}</li>
        <li><strong>Time:</strong> ${newTime}</li>
      </ul>
      <p>Please confirm this new time works for you or contact the agent to discuss alternatives.</p>
    `;

    try {
      await transporter.sendMail({
        from: this.configService.get('SMTP_FROM') || 'noreply@nestinestate.com',
        to: clientEmail,
        subject: `Viewing Rescheduled - ${house?.title || 'Property'}`,
        html: emailContent,
      });
    } catch (error) {
      console.error('Failed to send reschedule email:', error);
    }
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
    // Ensure no trailing slash and proper URL encoding
    const cleanFrontendUrl = frontendUrl.replace(/\/$/, '');
    const callbackUrl = `${cleanFrontendUrl}/viewings/payment/callback?tx_ref=${encodeURIComponent(txRef)}`;

    try {
      // NEW APPROACH: Use Flutterwave Split Payment Subaccounts
      // Payment automatically splits: platform keeps commission %, agent gets their share %
      const agentIdString = agent._id?.toString() || agent.id;
      
      // Get platform fee percentage (dynamic from settings)
      let platformFeePercentage = parseFloat(
        this.configService.get<string>('VIEWING_FEE_PERCENTAGE') || '10',
      );
      try {
        const settings = await this.settingsModel.findOne({ key: 'platformFeePercentage' });
        if (settings && typeof settings.value === 'number') {
          platformFeePercentage = settings.value;
        }
      } catch (error) {
        // If Settings model not available, use env variable
      }

      // Check if agent has virtual account for split payment
      // Funds will go to agent's virtual account, then they can withdraw to bank account
      let subaccounts: any[] = [];
      
      // Check if agent has virtual account
      try {
        const agentWallet = await this.flutterwaveService.getWalletByUserId(agentIdString);
        
        if (agentWallet && agentWallet.accountNumber && agentWallet.bankCode) {
          // Ensure split payment subaccount exists using virtual account details
          const splitSubaccountId = await this.flutterwaveService.ensureSplitPaymentSubaccount(agentIdString);

          if (splitSubaccountId) {
            // Calculate agent's percentage (agent gets 90%, platform keeps 10%)
            // split_value should be the percentage going to the SUBACCOUNT (agent), not platform commission
            const agentPercentage = 100 - platformFeePercentage; // e.g., 100 - 10 = 90
            
            subaccounts = [
              {
                id: splitSubaccountId, // Split payment subaccount ID (RS_xxx) pointing to virtual account
                transaction_charge_type: 'percentage' as const,
                transaction_charge: agentPercentage, // Agent gets 90%, platform keeps 10%
              },
            ];
            this.logger.log(`✓ Split payment configured: Agent's virtual account ${agentWallet.accountNumber} receives ${agentPercentage}%, Platform keeps ${platformFeePercentage}%`);
          } else {
            this.logger.warn(`⚠ Could not create split payment subaccount for agent ${agentIdString}. Payment will go to platform account.`);
          }
        } else {
          this.logger.warn(`⚠ Agent ${agentIdString} does not have a virtual account. Payment will go to platform account.`);
        }
      } catch (error: any) {
        this.logger.error(`✗ Error setting up split payment for agent ${agentIdString}:`, error.message || error);
        this.logger.warn('Payment will go to platform account and will need to be transferred manually');
      }

      // Initialize payment with split payment subaccount (if available)
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
        customizations: {
          title: 'House Me - Viewing Fee Payment',
          description: `Property viewing fee payment - ${house.title || 'Property'}`,
          logo: 'https://house-me.vercel.app/logo.png',
        },
        subaccounts: subaccounts.length > 0 ? subaccounts : undefined,
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
      .populate('agentId', 'name email')
      .populate('userId', 'name email')
      .exec();

    if (!viewing) {
      throw new NotFoundException('Viewing not found');
    }

    // Verify payment with Flutterwave using tx_ref
    const verification = await this.flutterwaveService.verifyPaymentByReference(txRef);

  // DEBUG: log verification data to inspect split/subaccount information
  this.logger.log(`Flutterwave verification data for tx_ref=${txRef}: ${JSON.stringify(verification.data || verification)}`);

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

    // NEW APPROACH: 
    // Payment goes to platform account first (no split at payment time)
    // Then transfer only agent's share (e.g., 90%) to agent's virtual account
    // Platform commission (e.g., 10%) stays in platform account - no need to transfer it
    // Extract agent ID properly (handle both populated and non-populated cases)
    let agentId: string;
    let houseId: string;
    
    // Check if agentId is populated (object) or just an ObjectId
    const agentIdValue = viewing.agentId as any;
    if (agentIdValue && typeof agentIdValue === 'object') {
      // If it's a populated object, extract _id or id
      if (agentIdValue._id) {
        agentId = agentIdValue._id.toString();
      } else if (agentIdValue.id) {
        agentId = agentIdValue.id.toString();
      } else {
        // If it's an ObjectId directly
        agentId = agentIdValue.toString();
      }
    } else {
      // If it's already a string or ObjectId
      agentId = agentIdValue?.toString() || '';
    }
    
    // Check if houseId is populated (object) or just an ObjectId
    const houseIdValue = viewing.houseId as any;
    if (houseIdValue && typeof houseIdValue === 'object') {
      // If it's a populated object, extract _id or id
      if (houseIdValue._id) {
        houseId = houseIdValue._id.toString();
      } else if (houseIdValue.id) {
        houseId = houseIdValue.id.toString();
      } else {
        // If it's an ObjectId directly
        houseId = houseIdValue.toString();
      }
    } else {
      // If it's already a string or ObjectId
      houseId = houseIdValue?.toString() || '';
    }
    
    if (!agentId) {
      throw new Error('Unable to extract agent ID from viewing');
    }
    if (!houseId) {
      throw new Error('Unable to extract house ID from viewing');
    }
    
    const agent = await this.usersService.findById(agentId);
    if (agent) {
      const house = await this.housesService.findOne(houseId);
      const userName = (viewing as any).userId?.name || (viewing as any).guestName || 'Guest';
      
      // Check if split payment was used (agent has split payment subaccount)
      const agentWallet = await this.flutterwaveService.getWalletByUserId(agentId);
      const usedSplitPayment = agentWallet && agentWallet.subaccountId && agentWallet.subaccountId.startsWith('RS_');
      
      if (usedSplitPayment) {
        // Split payment was configured - funds automatically split at payment time
        // Agent's share (90%) goes to their virtual account wallet
        // Platform commission (10%) stays in platform account automatically
        this.logger.log(`✓ Split payment processed automatically: ₦${agentAmount} (${100 - platformFeePercentage}%) to agent ${agentId} virtual account (${agentWallet.accountNumber}), ₦${platformFee} (${platformFeePercentage}%) to platform.`);
        
        // Sync balance from Flutterwave virtual account (funds should be there now)
        try {
          const balanceData = await this.flutterwaveService.getAvailableBalance(agentId);
          const actualBalance = balanceData.data?.available_balance || balanceData.data?.ledger_balance || 0;
          await this.usersService.updateWalletBalance(agentId, actualBalance);
          this.logger.log(`✓ Agent ${agentId} balance synced with Flutterwave virtual account: ₦${actualBalance.toLocaleString()}`);
        } catch (balanceError: any) {
          // If sync fails, add to local balance as fallback
          this.logger.warn(`Could not sync Flutterwave balance, updating locally:`, balanceError.message || balanceError);
          await this.usersService.addToWalletBalance(agentId, agentAmount);
          this.logger.log(`✓ Local earnings balance updated: ₦${agentAmount} added to agent ${agentId}`);
        }
      } else {
        // Split payment was not configured - full payment went to platform account
        // This should not happen if agent has virtual account, but handle gracefully
        this.logger.warn(`⚠ Split payment was not configured. Full payment (₦${viewing.viewingFee}) is in platform account.`);
        this.logger.warn(`  Platform commission (₦${platformFee}) stays in platform. Agent share (₦${agentAmount}) requires manual disbursement.`);
        
        // Still add to local balance for tracking
        await this.usersService.addToWalletBalance(agentId, agentAmount);
        this.logger.warn(`Added ₦${agentAmount} to agent ${agentId} local earnings. Manual transfer required.`);
      }
      
      // Create earning record
      await this.usersService.createEarning({
        userId: agentId,
        amount: agentAmount,
        grossAmount: viewing.viewingFee!,
        platformFee: platformFeePercentage,
        type: 'viewing_fee',
        description: `Viewing fee for ${house?.title || 'property'}`,
        viewingId: viewing._id?.toString(),
        houseId: houseId,
        propertyTitle: house?.title,
        clientName: userName,
      });
    }

    // Send email notifications to user and agent
    const houseDetails = await this.housesService.findOne(houseId);
    try {
      const userEmail = (viewing as any).userId?.email || (viewing as any).guestEmail;
      const clientName = (viewing as any).userId?.name || (viewing as any).guestName || 'User';
      const agentEmail = (viewing as any).agentId?.email;
      const agentName = (viewing as any).agentId?.name || 'Agent';

      if (userEmail) {
        await this.emailService.sendViewingPaymentConfirmationEmail(
          userEmail,
          clientName,
          viewing.viewingFee!,
          houseDetails?.title || 'Property',
          viewing.scheduledDate,
          viewing.scheduledTime,
        );
      }

      if (agentEmail) {
        await this.emailService.sendViewingPaymentReceivedEmail(
          agentEmail,
          agentName,
          viewing.viewingFee!,
          agentAmount,
          platformFee,
          houseDetails?.title || 'Property',
          clientName,
        );
      }
    } catch (error) {
      this.logger.error('Failed to send payment confirmation emails:', error);
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
