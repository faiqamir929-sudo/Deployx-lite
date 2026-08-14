import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { AnalyzeFailureDto, ReviewReadmeDto, SuggestEnvVarsDto, ChatDto } from './dto/ai.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('AI Assistant')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) { }

  @Post('analyze-failure')
  @ApiOperation({ summary: 'Explain deployment failure and suggest fixes' })
  analyzeFailure(@Body() dto: AnalyzeFailureDto, @CurrentUser() user: JwtPayload) {
    return this.aiService.analyzeFailure(dto, user);
  }

  @Post('review-readme')
  @ApiOperation({ summary: 'Review README quality' })
  reviewReadme(@Body() dto: ReviewReadmeDto) {
    return this.aiService.reviewReadme(dto);
  }

  @Post('suggest-env-vars')
  @ApiOperation({ summary: 'Detect missing environment variables' })
  suggestEnvVars(@Body() dto: SuggestEnvVarsDto, @CurrentUser() user: JwtPayload) {
    return this.aiService.suggestEnvVars(dto, user);
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with deployment assistant' })
  chat(@Body() dto: ChatDto, @CurrentUser() user: JwtPayload) {
    return this.aiService.chat(dto, user);
  }
}
