import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Viewing, ViewingDocument } from './schemas/viewing.schema';
import { UsersService } from '../users/users.service';
import { HousesService } from '../houses/houses.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ViewingsService {
  constructor(
    @InjectModel(Viewing.name) private viewingModel: Model<ViewingDocument>,
    private usersService: UsersService,
    private housesService: HousesService,
    private configService: ConfigService,
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
    };
  }
}
