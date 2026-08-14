import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) { }

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  findAll(@CurrentUser() user: JwtPayload, @Query('archived') archived?: string) {
    return this.projectsService.findAll(user, archived === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.remove(id, user);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.archive(id, user);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.restore(id, user);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.duplicate(id, user);
  }
}
