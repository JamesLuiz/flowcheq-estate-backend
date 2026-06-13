import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

/**
 * Unified Socket.IO gateway for the whole app.
 * - Authenticates each connection with the same JWT used for REST.
 * - Puts every socket into a private room `user:{userId}`.
 * - Relays chat typing/read receipts and lets the server push
 *   `notification:new` and `chat:message` events to any user.
 *
 * CORS origins mirror the REST CORS config in main.ts.
 */
@WebSocketGateway({
  cors: {
    origin: ['https://house-me.vercel.app', 'http://localhost:8080', 'http://localhost:5173'],
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.realtimeService.setServer(server);
    this.logger.log('Realtime Socket.IO gateway initialised');
  }

  private extractToken(client: Socket): string | undefined {
    const authToken =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);
    if (authToken) return authToken.replace(/^Bearer\s+/i, '');

    const header = client.handshake.headers?.authorization;
    if (header) return header.replace(/^Bearer\s+/i, '');
    return undefined;
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const userId = payload.sub;
      client.data.userId = userId;
      await client.join(`user:${userId}`);
      client.emit('realtime:ready', { userId });
      this.logger.debug(`Socket connected: ${client.id} -> user:${userId}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  /** Client signals it is typing to a partner. */
  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { to: string; houseId?: string },
  ) {
    const from = client.data.userId as string | undefined;
    if (!from || !data?.to) return;
    this.realtimeService.emitToUser(data.to, 'chat:typing', {
      from,
      houseId: data.houseId,
    });
  }

  /** Optional explicit room join (e.g. after token refresh). */
  @SubscribeMessage('realtime:subscribe')
  async handleSubscribe(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) await client.join(`user:${userId}`);
    return { ok: Boolean(userId) };
  }
}
