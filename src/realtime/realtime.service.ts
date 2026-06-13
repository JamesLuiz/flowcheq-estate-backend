import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Thin transport wrapper so feature modules can push realtime events
 * to a user's room without depending on the gateway directly.
 * Rooms are keyed `user:{userId}`.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  get isReady() {
    return this.server !== null;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    if (!this.server) {
      this.logger.debug(`Socket server not ready; dropped "${event}" for ${userId}`);
      return;
    }
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    const unique = Array.from(new Set(userIds.filter(Boolean)));
    unique.forEach((id) => this.emitToUser(id, event, payload));
  }
}
