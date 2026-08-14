import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, Prisma } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) { }

  async findAll(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, message, metadata: metadata as Prisma.InputJsonValue | undefined },
    });
  }
}
