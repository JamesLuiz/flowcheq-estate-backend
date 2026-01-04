import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { UsersService } from '../users/users.service';
import { HousesService } from '../houses/houses.service';

// Pusher is optional - install with: npm install pusher
let Pusher: any = null;
try {
  Pusher = require('pusher');
} catch (e) {
  // Pusher not installed
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private pusher: any = null;

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly usersService: UsersService,
    private readonly housesService: HousesService,
  ) {
    // Initialize Pusher if credentials are available
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER || 'eu';

    if (Pusher && appId && key && secret) {
      this.pusher = new Pusher({
        appId,
        key,
        secret,
        cluster,
        useTLS: true,
      });
      this.logger.log('Pusher initialized successfully');
    } else {
      this.logger.warn('Pusher not configured or not installed. Real-time messaging will use polling.');
    }
  }

  async sendMessage(senderId: string, dto: SendMessageDto) {
    // Verify receiver exists
    const receiver = await this.usersService.findById(dto.receiverId);
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }

    // Get sender info
    const sender = await this.usersService.findById(senderId);
    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    // Validate co-tenant messaging (both must have booked the same property)
    if (dto.conversationType === 'co-tenant' && dto.houseId) {
      const house = await this.housesService.findOne(dto.houseId);
      if (!house.isShared) {
        throw new ForbiddenException('Co-tenant messaging is only available for shared properties');
      }
      const bookedUsers = house.bookedByUsers?.map((id: any) => id.toString()) || [];
      if (!bookedUsers.includes(senderId) || !bookedUsers.includes(dto.receiverId)) {
        throw new ForbiddenException('Both users must have booked a slot to use co-tenant messaging');
      }
    }

    const message = new this.messageModel({
      senderId: new Types.ObjectId(senderId),
      receiverId: new Types.ObjectId(dto.receiverId),
      houseId: dto.houseId ? new Types.ObjectId(dto.houseId) : undefined,
      content: dto.content,
      conversationType: dto.conversationType || 'tenant-agent',
    });

    const savedMessage = await message.save();

    // Trigger real-time notification via Pusher
    if (this.pusher) {
      try {
        const messageDoc = savedMessage.toObject ? savedMessage.toObject() : savedMessage;
        await this.pusher.trigger(`user-${dto.receiverId}`, 'new-message', {
          id: savedMessage._id.toString(),
          senderId,
          senderName: sender.name,
          senderAvatar: sender.avatarUrl,
          content: dto.content,
          houseId: dto.houseId,
          conversationType: dto.conversationType || 'tenant-agent',
          createdAt: (messageDoc as any).createdAt || new Date(),
        });
        this.logger.log(`Pusher notification sent to user-${dto.receiverId}`);
      } catch (error) {
        this.logger.error('Failed to send Pusher notification:', error);
      }
    }

    return this.toMessageResponse(savedMessage, sender, receiver);
  }

  async getConversations(userId: string) {
    // Get all unique conversations for the user
    const messages = await this.messageModel
      .find({
        $or: [
          { senderId: new Types.ObjectId(userId) },
          { receiverId: new Types.ObjectId(userId) },
        ],
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Group by conversation partner
    const conversationsMap = new Map<string, any>();
    
    for (const msg of messages) {
      const partnerId = msg.senderId.toString() === userId 
        ? msg.receiverId.toString() 
        : msg.senderId.toString();
      
      if (!conversationsMap.has(partnerId)) {
        const partner = await this.usersService.findById(partnerId);
        conversationsMap.set(partnerId, {
          partnerId,
          partnerName: partner?.name || 'Unknown User',
          partnerAvatar: partner?.avatarUrl,
          partnerRole: partner?.role,
          lastMessage: msg.content,
          lastMessageAt: (msg as any).createdAt || new Date(),
          unreadCount: msg.receiverId.toString() === userId && !msg.read ? 1 : 0,
          houseId: msg.houseId?.toString(),
          conversationType: msg.conversationType,
        });
      } else if (msg.receiverId.toString() === userId && !msg.read) {
        const conv = conversationsMap.get(partnerId);
        conv.unreadCount += 1;
      }
    }

    return Array.from(conversationsMap.values());
  }

  async getMessages(userId: string, partnerId: string, houseId?: string) {
    const query: any = {
      $or: [
        { senderId: new Types.ObjectId(userId), receiverId: new Types.ObjectId(partnerId) },
        { senderId: new Types.ObjectId(partnerId), receiverId: new Types.ObjectId(userId) },
      ],
    };

    if (houseId) {
      query.houseId = new Types.ObjectId(houseId);
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: 1 })
      .populate('senderId', 'name avatarUrl')
      .populate('receiverId', 'name avatarUrl')
      .lean()
      .exec();

    // Mark messages as read
    await this.messageModel.updateMany(
      {
        senderId: new Types.ObjectId(partnerId),
        receiverId: new Types.ObjectId(userId),
        read: false,
      },
      { $set: { read: true } },
    ).exec();

    return messages.map((msg: any) => ({
      id: msg._id.toString(),
      senderId: msg.senderId._id?.toString() || msg.senderId.toString(),
      senderName: msg.senderId.name || 'Unknown',
      senderAvatar: msg.senderId.avatarUrl,
      receiverId: msg.receiverId._id?.toString() || msg.receiverId.toString(),
      receiverName: msg.receiverId.name || 'Unknown',
      receiverAvatar: msg.receiverId.avatarUrl,
      content: msg.content,
      read: msg.read,
      houseId: msg.houseId?.toString(),
      conversationType: msg.conversationType,
      createdAt: msg.createdAt,
    }));
  }

  async getUnreadCount(userId: string) {
    const count = await this.messageModel.countDocuments({
      receiverId: new Types.ObjectId(userId),
      read: false,
    }).exec();
    return { unreadCount: count };
  }

  async markAsRead(userId: string, partnerId: string) {
    await this.messageModel.updateMany(
      {
        senderId: new Types.ObjectId(partnerId),
        receiverId: new Types.ObjectId(userId),
        read: false,
      },
      { $set: { read: true } },
    ).exec();
    return { success: true };
  }

  private toMessageResponse(message: MessageDocument, sender?: any, receiver?: any) {
    const plain = message.toObject({ getters: true });
    const { _id, __v, ...rest } = plain as any;
    return {
      id: _id?.toString(),
      ...rest,
      senderId: rest.senderId?.toString(),
      receiverId: rest.receiverId?.toString(),
      houseId: rest.houseId?.toString(),
      senderName: sender?.name,
      senderAvatar: sender?.avatarUrl,
      receiverName: receiver?.name,
      receiverAvatar: receiver?.avatarUrl,
    };
  }
}
