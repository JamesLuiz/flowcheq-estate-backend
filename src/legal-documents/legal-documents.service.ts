import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { LegalDocument, LegalDocumentDocument } from './schemas/legal-document.schema';

@Injectable()
export class LegalDocumentsService {
  constructor(
    @InjectModel(LegalDocument.name)
    private readonly legalDocModel: Model<LegalDocumentDocument>,
  ) {}

  async initiate(tenantId: string, payload: any) {
    return this.legalDocModel.create({
      ...payload,
      tenantId,
      templateVersion: payload.templateVersion ?? 'FCT_v1.2',
      state: payload.state ?? 'FCT',
      status: 'draft',
      paymentStatus: 'pending',
      paymentAmount: 1500000,
      signatures: {
        tenant: null,
        landlord: null,
      },
      auditTrail: [
        {
          event: 'document_initiated',
          timestamp: new Date(),
          actorId: tenantId,
          actorRole: 'tenant',
          metadata: {},
        },
      ],
    });
  }

  async pay(id: string) {
    const doc = await this.legalDocModel.findById(id);
    if (!doc) {
      throw new NotFoundException('Legal document not found');
    }
    doc.paymentStatus = 'paid';
    doc.status = 'awaiting_tenant_signature';
    doc.auditTrail = [
      ...(doc.auditTrail ?? []),
      { event: 'payment_confirmed', timestamp: new Date(), actorRole: 'system', metadata: {} },
    ];
    await doc.save();
    return doc;
  }

  async paymentCallback(payload: any) {
    if (!payload?.documentId) {
      return { success: true, ignored: true };
    }
    await this.pay(payload.documentId);
    return { success: true };
  }

  async preview(id: string) {
    const doc = await this.legalDocModel.findById(id);
    if (!doc) throw new NotFoundException('Legal document not found');
    return doc;
  }

  async sign(id: string, userId: string, role: 'tenant' | 'landlord', signatureImageUrl?: string) {
    const doc = await this.legalDocModel.findById(id);
    if (!doc) throw new NotFoundException('Legal document not found');

    const signatures = (doc.signatures ?? {}) as any;
    signatures[role] = {
      signedAt: new Date(),
      signatureImageUrl: signatureImageUrl ?? null,
      actorId: userId,
    };
    doc.signatures = signatures;

    const tenantSigned = Boolean(signatures?.tenant?.signedAt);
    const landlordSigned = Boolean(signatures?.landlord?.signedAt);
    if (tenantSigned && landlordSigned) {
      doc.status = 'fully_executed';
      doc.documentHash = crypto
        .createHash('sha256')
        .update(`${doc._id.toString()}-${Date.now()}`)
        .digest('hex');
    } else {
      doc.status = role === 'tenant' ? 'awaiting_landlord_signature' : 'awaiting_tenant_signature';
    }

    doc.auditTrail = [
      ...(doc.auditTrail ?? []),
      { event: `${role}_signed`, timestamp: new Date(), actorId: userId, actorRole: role, metadata: {} },
    ];

    await doc.save();
    return doc;
  }

  async download(id: string) {
    const doc = await this.legalDocModel.findById(id);
    if (!doc) throw new NotFoundException('Legal document not found');
    return { documentUrl: doc.documentUrl ?? null, status: doc.status };
  }

  async auditTrail(id: string) {
    const doc = await this.legalDocModel.findById(id);
    if (!doc) throw new NotFoundException('Legal document not found');
    return { auditTrail: doc.auditTrail ?? [] };
  }

  my(userId: string) {
    return this.legalDocModel.find({
      $or: [{ tenantId: userId }, { landlordId: userId }],
    }).sort({ createdAt: -1 });
  }

  templates() {
    return [{ templateVersion: 'FCT_v1.2', state: 'FCT' }];
  }

  uploadTemplate(payload: any) {
    return {
      success: true,
      templateVersion: payload.templateVersion ?? 'custom_template',
      state: payload.state ?? 'unknown',
    };
  }
}
