import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DeploymentsService, DEPLOYMENT_QUEUE } from './deployments.service';
import { DeploymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface PipelineJob {
  deploymentId: string;
  projectId: string;
  userId: string;
  repoUrl: string;
  branch: string;
  framework?: string;
}

const PIPELINE_STEPS = [
  { name: 'Clone Repository', duration: 2000 },
  { name: 'Install Dependencies', duration: 3000 },
  { name: 'Run Tests', duration: 2500 },
  { name: 'Build Project', duration: 3500 },
  { name: 'Deploy', duration: 2000 },
  { name: 'Health Check', duration: 1500 },
];

@Processor(DEPLOYMENT_QUEUE)
export class DeploymentProcessor extends WorkerHost {
  private readonly logger = new Logger(DeploymentProcessor.name);

  constructor(
    private deployments: DeploymentsService,
    private prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<PipelineJob>) {
    const { deploymentId, repoUrl, branch, framework } = job.data;
    const startTime = Date.now();

    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: DeploymentStatus.RUNNING },
    });

    await this.deployments.appendLog(deploymentId, `[Pipeline] Starting deployment simulation`);
    await this.deployments.appendLog(deploymentId, `[Config] Repository: ${repoUrl}`);
    await this.deployments.appendLog(deploymentId, `[Config] Branch: ${branch}`);
    if (framework) await this.deployments.appendLog(deploymentId, `[Config] Framework: ${framework}`);

    try {
      for (const step of PIPELINE_STEPS) {
        await this.deployments.appendLog(deploymentId, `[${step.name}] Starting...`);
        await this.sleep(step.duration);
        await job.updateProgress(PIPELINE_STEPS.indexOf(step) + 1);
        await this.deployments.appendLog(deploymentId, `[${step.name}] ✓ Completed (${step.duration}ms)`);
      }

      const durationMs = Date.now() - startTime;
      await this.deployments.appendLog(deploymentId, `[Pipeline] Deployment successful in ${durationMs}ms`);
      await this.deployments.complete(deploymentId, DeploymentStatus.SUCCESS, durationMs);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const reason = error instanceof Error ? error.message : 'Unknown error';
      await this.deployments.appendLog(deploymentId, `[Pipeline] ✗ Failed: ${reason}`);
      await this.deployments.complete(deploymentId, DeploymentStatus.FAILED, durationMs, reason);
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
