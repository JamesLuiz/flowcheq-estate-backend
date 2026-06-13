import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PartnerLead,
  PartnerLeadDocument,
  PartnerLeadStatus,
} from './schemas/partner-lead.schema';
import { CreatePartnerLeadDto } from './dto/create-partner-lead.dto';
import {
  ContactPartnerLeadDto,
  UpdatePartnerLeadDto,
} from './dto/update-partner-lead.dto';
import { EmailService } from '../auth/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PartnerLeadsService {
  constructor(
    @InjectModel(PartnerLead.name)
    private readonly leadModel: Model<PartnerLeadDocument>,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async createPublic(dto: CreatePartnerLeadDto) {
    const existing = await this.leadModel
      .findOne({ $or: [{ email: dto.email.toLowerCase() }, { phone: dto.phone }] })
      .lean()
      .exec();

    if (existing) {
      throw new BadRequestException(
        'We already have your details on file. Our team will contact you soon.',
      );
    }

    const lead = await this.leadModel.create({
      ...dto,
      email: dto.email.toLowerCase(),
      dateOfBirth: new Date(dto.dateOfBirth),
      source: 'partners-form',
      status: PartnerLeadStatus.New,
    });

    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    if (adminEmail) {
      await this.emailService.sendEmail({
        to: adminEmail,
        subject: `New landlord partner lead: ${dto.name}`,
        html: `<p><strong>${dto.name}</strong> submitted the partners form.</p>
          <p>Phone: ${dto.phone}<br/>Email: ${dto.email}</p>`,
      });
    }

    return this.toResponse(lead);
  }

  async findAll(status?: PartnerLeadStatus) {
    const query = status ? { status } : {};
    const leads = await this.leadModel.find(query).sort({ createdAt: -1 }).lean().exec();
    return leads.map((l) => this.toResponse(l));
  }

  async findOne(id: string) {
    const lead = await this.leadModel.findById(id).lean().exec();
    if (!lead) throw new NotFoundException('Lead not found');
    return this.toResponse(lead);
  }

  async update(id: string, dto: UpdatePartnerLeadDto) {
    const lead = await this.leadModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .lean()
      .exec();
    if (!lead) throw new NotFoundException('Lead not found');
    return this.toResponse(lead);
  }

  async contact(id: string, dto: ContactPartnerLeadDto) {
    const lead = await this.leadModel.findById(id).exec();
    if (!lead) throw new NotFoundException('Lead not found');

    if (dto.channel === 'email') {
      await this.emailService.sendEmail({
        to: lead.email,
        subject: dto.subject ?? 'Flowcheq Estate — landlord onboarding',
        html: `<p>Hello ${lead.name},</p><p>${dto.message.replace(/\n/g, '<br/>')}</p>
          <p>— Flowcheq Estate team</p>`,
        text: dto.message,
      });
    }

    lead.lastContactedAt = new Date();
    lead.lastContactChannel = dto.channel;
    if (lead.status === PartnerLeadStatus.New) {
      lead.status = PartnerLeadStatus.Contacted;
    }
    await lead.save();

    return {
      ...this.toResponse(lead),
      whatsappUrl:
        dto.channel === 'whatsapp'
          ? this.buildWhatsAppUrl(lead.phone, dto.message)
          : undefined,
    };
  }

  buildWhatsAppUrl(phone: string, message: string) {
    const digits = phone.replace(/\D/g, '');
    const normalized = digits.startsWith('234') ? digits : `234${digits.replace(/^0/, '')}`;
    return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
  }

  private toResponse(doc: PartnerLeadDocument | Record<string, unknown>) {
    const d = doc as PartnerLeadDocument & { _id: { toString(): string }; createdAt?: Date; updatedAt?: Date };
    return {
      id: d._id.toString(),
      name: d.name,
      email: d.email,
      phone: d.phone,
      dateOfBirth: d.dateOfBirth,
      city: d.city,
      state: d.state,
      address: d.address,
      propertyCount: d.propertyCount,
      notes: d.notes,
      source: d.source,
      status: d.status,
      adminNotes: d.adminNotes,
      lastContactedAt: d.lastContactedAt,
      lastContactChannel: d.lastContactChannel,
      whatsappUrl: this.buildWhatsAppUrl(d.phone, 'Hello from Flowcheq Estate'),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
}
