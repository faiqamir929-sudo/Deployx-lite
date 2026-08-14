import { Module, forwardRef } from '@nestjs/common';
import { EnvVarsService } from './env-vars.service';
import { EnvVarsController } from './env-vars.controller';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ProjectsModule, forwardRef(() => NotificationsModule)],
  controllers: [EnvVarsController],
  providers: [EnvVarsService],
  exports: [EnvVarsService],
})
export class EnvVarsModule {}
