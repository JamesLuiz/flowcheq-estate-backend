import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import { RealtimeService } from '../realtime/realtime.service';

export interface CreateNotificationInput {
  userId: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly realtimeService: RealtimeService,
  ) {}

  /** Persist a notification and push it over the socket in real time. */
  async create(input: CreateNotificationInput) {
    const userId =
      typeof input.userId === 'string'
        ? new Types.ObjectId(input.userId)
        : input.userId;

    const doc = await this.notificationModel.create({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      data: input.data,
      read: false,
    });

    const payload = this.toResponse(doc);
    this.realtimeService.emitToUser(userId.toString(), 'notification:new', payload);
    return payload;
  }

  /** Fan-out the same notification to many recipients. */
  async createMany(userIds: Array<string | Types.ObjectId>, base: Omit<CreateNotificationInput, 'userId'>) {
    const unique = Array.from(
      new Set(userIds.map((id) => id.toString())),
    );
    return Promise.all(unique.map((userId) => this.create({ ...base, userId })));
  }

  async list(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (opts.unreadOnly) query.read = false;

    const docs = await this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(opts.limit ?? 50)
      .lean()
      .exec();

    return docs.map((d) => this.toResponse(d));
  }

  async unreadCount(userId: string) {
    const count = await this.notificationModel
      .countDocuments({ userId: new Types.ObjectId(userId), read: false })
      .exec();
    return { unreadCount: count };
  }

  async markRead(userId: string, notificationId: string) {
    await this.notificationModel
      .updateOne(
        { _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) },
        { $set: { read: true, readAt: new Date() } },
      )
      .exec();
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.notificationModel
      .updateMany(
        { userId: new Types.ObjectId(userId), read: false },
        { $set: { read: true, readAt: new Date() } },
      )
      .exec();
    return { success: true };
  }

  private toResponse(doc: NotificationDocument | Record<string, unknown>) {
    const d = doc as NotificationDocument & {
      _id: Types.ObjectId;
      createdAt?: Date;
    };
    return {
      id: d._id.toString(),
      type: d.type,
      title: d.title,
      body: d.body,
      link: d.link,
      data: d.data,
      read: d.read,
      createdAt: d.createdAt,
    };
  }
}
