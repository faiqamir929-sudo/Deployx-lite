import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) { }

  async findAll(user: JwtPayload, includeArchived = false) {
    const where = user.role === Role.ADMIN
      ? includeArchived ? {} : { archivedAt: null }
      : { ownerId: user.sub, ...(includeArchived ? {} : { archivedAt: null }) };

    return this.prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { deployments: true, envVars: true } } },
    });
  }

  async findOne(id: string, user: JwtPayload) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { deployments: true, envVars: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    this.assertAccess(project.ownerId, user);
    return project;
  }

  async create(dto: CreateProjectDto, user: JwtPayload) {
    return this.prisma.project.create({
      data: { ...dto, ownerId: user.sub },
    });
  }

  async update(id: string, dto: UpdateProjectDto, user: JwtPayload) {
    await this.findOne(id, user);
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: JwtPayload) {
    await this.findOne(id, user);
    await this.prisma.project.delete({ where: { id } });
    return { message: 'Project deleted' };
  }

  async archive(id: string, user: JwtPayload) {
    await this.findOne(id, user);
    return this.prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async restore(id: string, user: JwtPayload) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    this.assertAccess(project.ownerId, user);
    return this.prisma.project.update({ where: { id }, data: { archivedAt: null } });
  }

  async duplicate(id: string, user: JwtPayload) {
    const original = await this.prisma.project.findUnique({
      where: { id },
      include: { envVars: true },
    });
    if (!original) throw new NotFoundException('Project not found');
    this.assertAccess(original.ownerId, user);

    const copy = await this.prisma.project.create({
      data: {
        name: `${original.name} (Copy)`,
        description: original.description,
        repoUrl: original.repoUrl,
        branch: original.branch,
        framework: original.framework,
        environment: original.environment,
        tags: original.tags,
        ownerId: user.sub,
      },
    });

    if (original.envVars.length) {
      await this.prisma.environmentVariable.createMany({
        data: original.envVars.map((v) => ({
          projectId: copy.id,
          key: v.key,
          encryptedValue: v.encryptedValue,
          environment: v.environment,
        })),
      });
    }

    return copy;
  }

  private assertAccess(ownerId: string, user: JwtPayload) {
    if (user.role !== Role.ADMIN && ownerId !== user.sub) {
      throw new ForbiddenException('Access denied');
    }
  }
}
