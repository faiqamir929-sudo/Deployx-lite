import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { Role, DeploymentStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) { }

  async getStats(user: JwtPayload) {
    const projectFilter = user.role === Role.ADMIN ? {} : { ownerId: user.sub };

    const [projects, deployments, recentDeployments, notifications] = await Promise.all([
      this.prisma.project.count({ where: { ...projectFilter, archivedAt: null } }),
      this.prisma.deployment.findMany({
        where: { project: projectFilter },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deployment.findMany({
        where: { project: projectFilter },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          project: { select: { name: true } },
          triggeredBy: { select: { name: true } },
        },
      }),
      this.prisma.notification.findMany({
        where: { userId: user.sub },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const successful = deployments.filter((d) => d.status === DeploymentStatus.SUCCESS).length;
    const failed = deployments.filter((d) => d.status === DeploymentStatus.FAILED).length;
    const total = deployments.length;
    const successRate = total ? Math.round((successful / total) * 100) : 0;

    const completed = deployments.filter((d) => d.durationMs);
    const avgDuration = completed.length
      ? Math.round(completed.reduce((sum, d) => sum + (d.durationMs ?? 0), 0) / completed.length)
      : 0;

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      const count = deployments.filter(
        (d) => d.createdAt >= dayStart && d.createdAt <= dayEnd,
      ).length;
      return {
        date: dayStart.toISOString().split('T')[0],
        deployments: count,
      };
    });

    return {
      projects,
      totalDeployments: total,
      successfulDeployments: successful,
      failedDeployments: failed,
      successRate,
      avgDeploymentTimeMs: avgDuration,
      recentDeployments,
      recentNotifications: notifications,
      deploymentChart: last7Days,
    };
  }
}
