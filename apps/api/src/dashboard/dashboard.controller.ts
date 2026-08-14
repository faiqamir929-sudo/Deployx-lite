import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) { }

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics and charts data' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getStats(user);
  }
}
