import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateEnvVarDto, UpdateEnvVarDto } from './dto/env-var.dto';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { encrypt, decrypt } from '../common/utils/encryption.util';
import { Environment, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EnvVarsService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private config: ConfigService,
    private notifications: NotificationsService,
  ) { }

  private get encryptionKey() {
    return this.config.get<string>('ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef');
  }

  async findAll(projectId: string, user: JwtPayload, environment?: Environment) {
    await this.projects.findOne(projectId, user);
    const vars = await this.prisma.environmentVariable.findMany({
      where: { projectId, ...(environment ? { environment } : {}) },
      orderBy: { key: 'asc' },
    });
    return vars.map((v) => ({
      id: v.id,
      key: v.key,
      value: '••••••••',
      environment: v.environment,
      version: v.version,
      updatedAt: v.updatedAt,
    }));
  }

  async create(projectId: string, dto: CreateEnvVarDto, user: JwtPayload) {
    await this.projects.findOne(projectId, user);
    const existing = await this.prisma.environmentVariable.findUnique({
      where: { projectId_key_environment: { projectId, key: dto.key, environment: dto.environment } },
    });
    if (existing) throw new ConflictException('Variable already exists for this environment');

    const encryptedValue = encrypt(dto.value, this.encryptionKey);
    const envVar = await this.prisma.environmentVariable.create({
      data: { projectId, key: dto.key, encryptedValue, environment: dto.environment },
    });

    await this.prisma.envVarHistory.create({
      data: { envVarId: envVar.id, key: dto.key, encryptedValue, version: 1, changedBy: user.sub },
    });

    await this.notifications.create(user.sub, NotificationType.ENVIRONMENT_CHANGE, 'Environment Updated', `Added ${dto.key} to ${dto.environment}`);

    return { id: envVar.id, key: envVar.key, environment: envVar.environment, version: 1 };
  }

  async update(projectId: string, id: string, dto: UpdateEnvVarDto, user: JwtPayload) {
    await this.projects.findOne(projectId, user);
    const envVar = await this.prisma.environmentVariable.findFirst({ where: { id, projectId } });
    if (!envVar) throw new NotFoundException('Variable not found');

    const encryptedValue = encrypt(dto.value, this.encryptionKey);
    const updated = await this.prisma.environmentVariable.update({
      where: { id },
      data: { encryptedValue, version: envVar.version + 1 },
    });

    await this.prisma.envVarHistory.create({
      data: { envVarId: id, key: envVar.key, encryptedValue, version: updated.version, changedBy: user.sub },
    });

    await this.notifications.create(user.sub, NotificationType.ENVIRONMENT_CHANGE, 'Environment Updated', `Updated ${envVar.key}`);

    return { id: updated.id, key: updated.key, version: updated.version };
  }

  async remove(projectId: string, id: string, user: JwtPayload) {
    await this.projects.findOne(projectId, user);
    await this.prisma.environmentVariable.delete({ where: { id } });
    return { message: 'Variable deleted' };
  }

  async history(projectId: string, id: string, user: JwtPayload) {
    await this.projects.findOne(projectId, user);
    return this.prisma.envVarHistory.findMany({
      where: { envVarId: id },
      orderBy: { version: 'desc' },
      select: { id: true, key: true, version: true, changedBy: true, createdAt: true },
    });
  }

  async getDecryptedKeys(projectId: string, environment: Environment): Promise<Record<string, string>> {
    const vars = await this.prisma.environmentVariable.findMany({ where: { projectId, environment } });
    const result: Record<string, string> = {};
    for (const v of vars) {
      result[v.key] = decrypt(v.encryptedValue, this.encryptionKey);
    }
    return result;
  }
}
