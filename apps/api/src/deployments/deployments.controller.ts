import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DeploymentsService } from './deployments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Deployments')
@ApiBearerAuth()
@Controller('projects/:projectId/deployments')
export class DeploymentsController {
  constructor(private deploymentsService: DeploymentsService) { }

  @Get()
  @ApiOperation({ summary: 'List deployment history' })
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.deploymentsService.findAll(projectId, user);
  }

  @Get(':id')
  findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.deploymentsService.findOne(projectId, id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Trigger a new deployment simulation' })
  trigger(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.deploymentsService.trigger(projectId, user);
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: 'Rollback to a previous deployment' })
  rollback(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.deploymentsService.rollback(projectId, id, user);
  }
}
