import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GitService } from './git.service';

@ApiTags('Git Integration')
@ApiBearerAuth()
@Controller('git')
export class GitController {
  constructor(private gitService: GitService) {}

  @Get('validate')
  @ApiOperation({ summary: 'Validate a GitHub repository URL' })
  validate(@Query('url') url: string) {
    return this.gitService.validateRepository(url);
  }

  @Get('info')
  @ApiOperation({ summary: 'Get repository branches and last commit' })
  info(@Query('url') url: string, @Query('branch') branch = 'main') {
    return this.gitService.getRepoInfo(url, branch);
  }
}
