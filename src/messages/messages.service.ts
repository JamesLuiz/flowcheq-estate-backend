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
    // Pusher uses WebSockets but it's a managed service - clients connect to Pusher's servers
    // This works fine with Vercel/serverless as we're not running a WebSocket server ourselves
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

    // Prevent sending messages to yourself (frontend should avoid showing this option)
    if (dto.receiverId === senderId) {
      throw new ForbiddenException('You cannot send messages to yourself');
    }

    // Get sender info
    const sender = await this.usersService.findById(senderId);
    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    // Validate co-tenant messaging (both must have booked the same property, OR sender is the agent/landlord)
    if (dto.conversationType === 'co-tenant' && dto.houseId) {
      const house = await this.housesService.findOne(dto.houseId);
      if (!house) {
        throw new NotFoundException('Property not found');
      }

      if (!house.isShared) {
        throw new ForbiddenException('Co-tenant messaging is only available for shared properties');
      }

      const bookedUsers = (house.bookedByUsers || []).map((id: any) => id.toString());

      // Allow if: both users booked the slot, OR sender is the agent/landlord/owner who manages the property
      const senderBooked = bookedUsers.includes(senderId);
      const receiverBooked = bookedUsers.includes(dto.receiverId);

      // Accept any of these owner/manager fields if present on the house document
      const ownerCandidates = [house.agentId, house.ownerId, house.landlordId].filter(Boolean).map((id: any) => id.toString());
      const senderAuthorized = ownerCandidates.includes(senderId);

      if (!senderAuthorized && (!senderBooked || !receiverBooked)) {
        throw new ForbiddenException('You are not authorized to send co-tenant messages for this property');
      }
    }

    // For tenant-agent messaging, allow any authenticated user to message agents/landlords and vice versa
    // No additional validation needed - any authenticated user can send messages

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

    return this.toMessageResponse(savedMessage, sender, receiver, senderId);
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

    // Group by conversation partner. Cache user lookups to avoid repeated awaits.
    const conversationsMap = new Map<string, any>();
    const userCache = new Map<string, any>();

    for (const msg of messages) {
      const senderStr = msg.senderId?.toString();
      const receiverStr = msg.receiverId?.toString();
      const partnerId = senderStr === userId ? receiverStr : senderStr;

      // Skip conversations that are with self (defensive: frontend shouldn't show chat to yourself)
      if (!partnerId || partnerId === userId) continue;

      if (!conversationsMap.has(partnerId)) {
        let partner = userCache.get(partnerId);
        if (!partner) {
          partner = await this.usersService.findById(partnerId);
          userCache.set(partnerId, partner);
        }

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
    // Defensive: if partnerId equals requesting user, return empty list (no self-chat)
    if (partnerId === userId) return [];
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

    return messages.map((msg: any) => {
      const senderIdStr = msg.senderId && (msg.senderId._id && typeof msg.senderId._id.toString === 'function' ? msg.senderId._id.toString() : msg.senderId.toString());
      const receiverIdStr = msg.receiverId && (msg.receiverId._id && typeof msg.receiverId._id.toString === 'function' ? msg.receiverId._id.toString() : msg.receiverId.toString());

      return {
        id: msg._id.toString(),
        senderId: senderIdStr,
        senderName: msg.senderId?.name || 'Unknown',
        senderAvatar: msg.senderId?.avatarUrl,
        receiverId: receiverIdStr,
        receiverName: msg.receiverId?.name || 'Unknown',
        receiverAvatar: msg.receiverId?.avatarUrl,
        content: msg.content,
        read: msg.read,
        houseId: msg.houseId?.toString(),
        conversationType: msg.conversationType,
        createdAt: msg.createdAt,
        // Mark whether the message was sent by the requesting user (helps frontend avoid id-comparison bugs)
        isOwn: senderIdStr === userId,
      };
    });
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

  private toMessageResponse(message: MessageDocument, sender?: any, receiver?: any, currentUserId?: string) {
    const plain = message.toObject ? message.toObject({ getters: true }) : (message as any);
    const { _id, __v, ...rest } = plain as any;

    const asIdString = (val: any) => {
      if (!val && val !== 0) return undefined;
      // populated object with _id
      if (typeof val === 'object') {
        if (val._id) return val._id.toString();
        if (val.toString) return val.toString();
        return String(val);
      }
      return String(val);
    };

    const senderIdStr = asIdString(rest.senderId);
    const receiverIdStr = asIdString(rest.receiverId);
    const houseIdStr = asIdString(rest.houseId);

    return {
      id: _id?.toString(),
      content: rest.content,
      read: rest.read,
      conversationType: rest.conversationType,
      createdAt: rest.createdAt || new Date(),
      senderId: senderIdStr,
      receiverId: receiverIdStr,
      houseId: houseIdStr,
      senderName: sender?.name,
      senderAvatar: sender?.avatarUrl,
      receiverName: receiver?.name,
      receiverAvatar: receiver?.avatarUrl,
      // If we know the requesting user id, include isOwn flag so frontend can rely on it
      ...(currentUserId ? { isOwn: senderIdStr === currentUserId } : {}),
    };
  }
}
