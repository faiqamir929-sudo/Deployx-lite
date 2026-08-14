import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EnvVarsService } from './env-vars.service';
import { CreateEnvVarDto, UpdateEnvVarDto } from './dto/env-var.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import type { Environment } from '@prisma/client';

@ApiTags('Environment Variables')
@ApiBearerAuth()
@Controller('projects/:projectId/env-vars')
export class EnvVarsController {
  constructor(private envVarsService: EnvVarsService) { }

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Query('environment') environment?: Environment,
  ) {
    return this.envVarsService.findAll(projectId, user, environment);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateEnvVarDto, @CurrentUser() user: JwtPayload) {
    return this.envVarsService.create(projectId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEnvVarDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.envVarsService.update(projectId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.envVarsService.remove(projectId, id, user);
  }

  @Get(':id/history')
  history(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.envVarsService.history(projectId, id, user);
  }
}
