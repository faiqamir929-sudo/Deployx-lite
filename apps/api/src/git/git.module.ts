import { Module } from '@nestjs/common';
import { GitService } from './git.service';
import { GitController } from './git.controller';

@Module({
  controllers: [GitController],
  providers: [GitService],
  exports: [GitService],
})
export class GitModule {}
