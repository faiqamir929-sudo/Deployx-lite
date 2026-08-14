import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ProjectsModule } from '../projects/projects.module';
import { EnvVarsModule } from '../env-vars/env-vars.module';

@Module({
  imports: [ProjectsModule, EnvVarsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
