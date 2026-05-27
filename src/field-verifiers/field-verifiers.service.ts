import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  VerificationAssignment,
  VerificationAssignmentDocument,
} from './schemas/verification-assignment.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class FieldVerifiersService {
  constructor(
    @InjectModel(VerificationAssignment.name)
    private readonly assignmentModel: Model<VerificationAssignmentDocument>,
    private readonly usersService: UsersService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('Field verifier not found');
    }
    return this.usersService.toSafeUser(user);
  }

  getAssignments(fieldVerifierId: string) {
    return this.assignmentModel.find({ fieldVerifierId }).sort({ createdAt: -1 });
  }

  async getAssignment(fieldVerifierId: string, id: string) {
    const assignment = await this.assignmentModel.findOne({ _id: id, fieldVerifierId });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    return assignment;
  }

  async createAssignment(payload: {
    propertyId: string;
    fieldVerifierId: string;
    scheduledVisitDate?: Date;
  }) {
    return this.assignmentModel.create({
      ...payload,
      status: 'assigned',
    });
  }

  async checkIn(fieldVerifierId: string, id: string, coords: { lat: number; lng: number }) {
    const assignment = await this.getAssignment(fieldVerifierId, id);
    assignment.status = 'in_progress';
    assignment.checkInCoordinates = coords;
    assignment.checkInDistanceFromProperty = 0;
    assignment.checkInTime = new Date();
    await assignment.save();
    return assignment;
  }

  async submit(
    fieldVerifierId: string,
    id: string,
    payload: { photos?: string[]; verifierNotes?: string; conditionReport?: Record<string, unknown> },
  ) {
    const assignment = await this.getAssignment(fieldVerifierId, id);
    assignment.status = 'completed';
    assignment.photos = payload.photos ?? [];
    assignment.verifierNotes = payload.verifierNotes;
    assignment.conditionReport = payload.conditionReport;
    assignment.completedAt = new Date();
    assignment.payoutAmount = assignment.payoutAmount ?? 5000;
    assignment.payoutStatus = assignment.payoutStatus ?? 'pending';
    assignment.payoutReference =
      assignment.payoutReference ?? `FV-PAYOUT-${Date.now()}-${assignment._id.toString()}`;
    await assignment.save();
    return assignment;
  }

  async getEarnings(fieldVerifierId: string) {
    const completed = await this.assignmentModel.find({
      fieldVerifierId,
      status: 'completed',
    });
    const total = completed.reduce((sum, a) => sum + (a.payoutAmount ?? 0), 0);
    return {
      totalEarnings: total,
      totalAssignments: completed.length,
      earnings: completed.map((a) => ({
        assignmentId: a._id.toString(),
        propertyId: a.propertyId,
        payoutAmount: a.payoutAmount ?? 0,
        payoutStatus: a.payoutStatus ?? 'pending',
        payoutReference: a.payoutReference ?? null,
        completedAt: a.completedAt ?? null,
      })),
    };
  }

  async getLatestAssignmentForProperty(propertyId: string) {
    return this.assignmentModel.findOne({ propertyId }).sort({ createdAt: -1 });
  }
}
