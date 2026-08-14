import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { DeploymentStatus, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

export const DEPLOYMENT_QUEUE = 'deployment-pipeline';

@Injectable()
export class DeploymentsService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    @InjectQueue(DEPLOYMENT_QUEUE) private deploymentQueue: Queue,
    private notifications: NotificationsService,
  ) { }

  async findAll(projectId: string, user: JwtPayload) {
    await this.projects.findOne(projectId, user);
    return this.prisma.deployment.findMany({
      where: { projectId },
      orderBy: { number: 'desc' },
      include: { triggeredBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async findOne(projectId: string, deploymentId: string, user: JwtPayload) {
    await this.projects.findOne(projectId, user);
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, projectId },
      include: { triggeredBy: { select: { id: true, name: true, email: true } } },
    });
    if (!deployment) throw new NotFoundException('Deployment not found');
    return deployment;
  }

  async trigger(projectId: string, user: JwtPayload) {
    const project = await this.projects.findOne(projectId, user);
    const lastDeployment = await this.prisma.deployment.findFirst({
      where: { projectId },
      orderBy: { number: 'desc' },
    });
    const number = (lastDeployment?.number ?? 0) + 1;

    const deployment = await this.prisma.deployment.create({
      data: {
        projectId,
        number,
        status: DeploymentStatus.PENDING,
        triggeredById: user.sub,
      },
    });

    await this.deploymentQueue.add('run-pipeline', {
      deploymentId: deployment.id,
      projectId,
      userId: user.sub,
      repoUrl: project.repoUrl,
      branch: project.branch,
      framework: project.framework,
    });

    return deployment;
  }

  async rollback(projectId: string, deploymentId: string, user: JwtPayload) {
    const deployment = await this.findOne(projectId, deploymentId, user);
    if (!deployment.rollbackAvailable) {
      throw new BadRequestException('Rollback not available for this deployment');
    }

    const lastDeployment = await this.prisma.deployment.findFirst({
      where: { projectId },
      orderBy: { number: 'desc' },
    });

    const rollback = await this.prisma.deployment.create({
      data: {
        projectId,
        number: (lastDeployment?.number ?? 0) + 1,
        status: DeploymentStatus.ROLLED_BACK,
        durationMs: 1200,
        logs: `[ROLLBACK] Restored to deployment #${deployment.number}\n[Rollback] Previous version restored successfully.`,
        triggeredById: user.sub,
        rollbackAvailable: false,
      },
    });

    await this.notifications.create(
      user.sub,
      NotificationType.ROLLBACK,
      'Rollback Completed',
      `Rolled back to deployment #${deployment.number}`,
    );

    return rollback;
  }

  async appendLog(deploymentId: string, line: string) {
    const deployment = await this.prisma.deployment.findUnique({ where: { id: deploymentId } });
    if (!deployment) return;
    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: { logs: deployment.logs + line + '\n' },
    });
  }

  async complete(deploymentId: string, status: DeploymentStatus, durationMs: number, failureReason?: string) {
    const deployment = await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status,
        durationMs,
        failureReason,
        rollbackAvailable: status === DeploymentStatus.SUCCESS,
      },
    });

    const type = status === DeploymentStatus.SUCCESS
      ? NotificationType.DEPLOYMENT_SUCCESS
      : NotificationType.DEPLOYMENT_FAILED;

    await this.notifications.create(
      deployment.triggeredById,
      type,
      status === DeploymentStatus.SUCCESS ? 'Deployment Successful' : 'Deployment Failed',
      `Deployment #${deployment.number} ${status.toLowerCase()}${failureReason ? `: ${failureReason}` : ''}`,
      { deploymentId, projectId: deployment.projectId },
    );

    return deployment;
  }
}
