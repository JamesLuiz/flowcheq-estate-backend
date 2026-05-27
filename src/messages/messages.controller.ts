import {
  Controller,
  Delete,
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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('messages')
@ApiTags('Messages')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Get('threads')
  @Roles('tenant', 'landlord', 'real_estate_company', 'admin', 'field_verifier')
  @ApiOperation({ summary: 'All conversation threads' })
  @ApiResponse({ status: 200, description: 'Conversation threads returned' })
  listThreads(@CurrentUser() user: RequestUser) {
    return this.messagesService.listThreads(user.sub);
  }

  @Get('threads/:threadId')
  @Roles('tenant', 'landlord', 'real_estate_company', 'admin', 'field_verifier')
  @ApiOperation({ summary: 'Messages in a thread' })
  @ApiResponse({ status: 200, description: 'Thread messages returned' })
  getThreadMessages(
    @CurrentUser() user: RequestUser,
    @Param('threadId') threadId: string,
  ) {
    return this.messagesService.getThreadMessages(user.sub, threadId);
  }

  @Post('threads/start')
  @Roles('tenant')
  @ApiOperation({ summary: 'Start thread with landlord after enquiry' })
  @ApiResponse({ status: 201, description: 'Thread started successfully' })
  startThread(
    @CurrentUser() user: RequestUser,
    @Body() body: { partnerId: string; houseId?: string },
  ) {
    return this.messagesService.startThread(user.sub, body);
  }

  @Post('threads/:threadId')
  @Roles('tenant', 'landlord', 'real_estate_company', 'admin', 'field_verifier')
  @ApiOperation({ summary: 'Send message to a thread' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  sendToThread(
    @CurrentUser() user: RequestUser,
    @Param('threadId') threadId: string,
    @Body() body: { content: string },
  ) {
    return this.messagesService.sendThreadMessage(user.sub, threadId, body);
  }

  @Delete('threads/:threadId/:messageId')
  @Roles('tenant', 'landlord', 'real_estate_company', 'admin', 'field_verifier')
  @ApiOperation({ summary: 'Delete own message in thread' })
  @ApiResponse({ status: 200, description: 'Message deleted' })
  deleteFromThread(
    @CurrentUser() user: RequestUser,
    @Param('threadId') threadId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.deleteOwnMessage(user.sub, threadId, messageId);
  }

  @Post('threads/:threadId/report')
  @Roles('tenant', 'landlord', 'real_estate_company', 'admin', 'field_verifier')
  @ApiOperation({ summary: 'Report a conversation thread' })
  @ApiResponse({ status: 200, description: 'Thread reported successfully' })
  reportThread(
    @CurrentUser() user: RequestUser,
    @Param('threadId') threadId: string,
    @Body() body: { reason?: string },
  ) {
    return this.messagesService.reportThread(user.sub, threadId, body.reason);
  }
}
