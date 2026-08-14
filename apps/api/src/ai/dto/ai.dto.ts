import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeFailureDto {
  @ApiProperty()
  @IsUUID()
  deploymentId: string;

  @ApiProperty()
  @IsUUID()
  projectId: string;
}

export class ReviewReadmeDto {
  @ApiProperty()
  @IsString()
  readmeContent: string;
}

export class SuggestEnvVarsDto {
  @ApiProperty()
  @IsUUID()
  projectId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  framework?: string;
}

export class ChatDto {
  @ApiProperty()
  @IsString()
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
