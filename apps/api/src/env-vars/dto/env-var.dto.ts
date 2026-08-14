import { IsString, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Environment } from '@prisma/client';

export class CreateEnvVarDto {
  @ApiProperty({ example: 'DATABASE_URL' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'Key must be UPPER_SNAKE_CASE' })
  key: string;

  @ApiProperty()
  @IsString()
  value: string;

  @ApiPropertyOptional({ enum: Environment })
  @IsEnum(Environment)
  environment: Environment;
}

export class UpdateEnvVarDto {
  @ApiProperty()
  @IsString()
  value: string;
}
