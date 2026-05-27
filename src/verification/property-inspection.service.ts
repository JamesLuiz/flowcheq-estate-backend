import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { House, HouseDocument } from '../houses/schemas/house.schema';
import { FlutterwaveService } from '../promotions/flutterwave.service';
import { INSPECTION_FEE_NGN } from '../common/listing-requirements';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PropertyInspectionService {
  constructor(
    @InjectModel(House.name) private readonly houseModel: Model<HouseDocument>,
    @Inject(forwardRef(() => FlutterwaveService))
    private readonly flutterwaveService: FlutterwaveService,
    private readonly configService: ConfigService,
  ) {}

  async initializeInspectionPaymentForUser(
    propertyId: string,
    landlordId: string,
    email: string,
    name: string,
  ) {
    if (!Types.ObjectId.isValid(propertyId)) {
      throw new BadRequestException('Invalid property ID');
    }

    const house = await this.houseModel.findById(propertyId).exec();
    if (!house) {
      throw new NotFoundException('Property not found');
    }
    if (house.agentId.toString() !== landlordId) {
      throw new BadRequestException('You can only pay inspection fee for your own listings');
    }
    if (house.inspectionFeePaid) {
      return {
        alreadyPaid: true,
        amount: house.inspectionFeeAmount ?? INSPECTION_FEE_NGN,
      };
    }

    const frontendUrl =
      this.configService.get<string>('CLIENT_ORIGIN') || 'http://localhost:5173';
    const txRef = `insp_${propertyId}_${Date.now()}`;

    const payment = await this.flutterwaveService.initializePayment({
      amount: INSPECTION_FEE_NGN,
      email,
      name,
      tx_ref: txRef,
      callback_url: `${frontendUrl}/dashboard?inspection=success&propertyId=${propertyId}`,
      meta: { propertyId, type: 'property_inspection' },
    });

    await this.houseModel.findByIdAndUpdate(propertyId, {
      inspectionPaymentRef: txRef,
      inspectionFeeAmount: INSPECTION_FEE_NGN,
    });

    return {
      amount: INSPECTION_FEE_NGN,
      currency: 'NGN',
      txRef,
      paymentLink: payment.paymentLink,
      transactionId: payment.transactionId,
      alreadyPaid: false,
    };
  }

  async confirmInspectionPayment(propertyId: string, transactionId: string) {
    const verified = await this.flutterwaveService.verifyPayment(transactionId);
    if (!verified.success) {
      throw new BadRequestException('Payment not completed');
    }

    const house = await this.houseModel.findByIdAndUpdate(
      propertyId,
      {
        inspectionFeePaid: true,
        inspectionPaidAt: new Date(),
        inspectionPaymentRef: transactionId,
      },
      { new: true },
    );

    if (!house) {
      throw new NotFoundException('Property not found');
    }

    return {
      success: true,
      propertyId,
      inspectionFeePaid: true,
      amount: house.inspectionFeeAmount ?? INSPECTION_FEE_NGN,
    };
  }

  async assertInspectionPaid(propertyId: string) {
    const house = await this.houseModel.findById(propertyId).select('inspectionFeePaid').lean();
    if (!house) {
      throw new NotFoundException('Property not found');
    }
    if (!house.inspectionFeePaid) {
      throw new BadRequestException(
        `Pay the ₦${INSPECTION_FEE_NGN.toLocaleString()} property inspection fee before requesting field verification.`,
      );
    }
  }
}
