import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('messages')
@ApiTags('Messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Send a message' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async sendMessage(
    @CurrentUser() user: RequestUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(user.sub, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get all conversations' })
  @ApiResponse({ status: 200, description: 'List of conversations' })
  async getConversations(@CurrentUser() user: RequestUser) {
    return this.messagesService.getConversations(user.sub);
  }

  @Get('conversation/:partnerId')
  @ApiOperation({ summary: 'Get messages with a specific user' })
  @ApiQuery({ name: 'houseId', required: false, description: 'Filter by property' })
  @ApiResponse({ status: 200, description: 'List of messages' })
  async getMessages(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
    @Query('houseId') houseId?: string,
  ) {
    return this.messagesService.getMessages(user.sub, partnerId, houseId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread message count' })
  @ApiResponse({ status: 200, description: 'Unread count' })
  async getUnreadCount(@CurrentUser() user: RequestUser) {
    return this.messagesService.getUnreadCount(user.sub);
  }

  @Post('mark-read/:partnerId')
  @ApiOperation({ summary: 'Mark messages from a user as read' })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  async markAsRead(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
  ) {
    return this.messagesService.markAsRead(user.sub, partnerId);
  }
}
