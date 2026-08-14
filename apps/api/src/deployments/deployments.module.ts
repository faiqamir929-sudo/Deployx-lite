import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DeploymentsService, DEPLOYMENT_QUEUE } from './deployments.service';
import { DeploymentsController } from './deployments.controller';
import { DeploymentProcessor } from './deployment.processor';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ProjectsModule,
    forwardRef(() => NotificationsModule),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue({ name: DEPLOYMENT_QUEUE }),
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeploymentProcessor],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
