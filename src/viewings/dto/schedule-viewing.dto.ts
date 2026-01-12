import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleViewingDto {
  @ApiProperty({ example: '64a1f2e9c...', description: 'House ID' })
  @IsString()
  @IsNotEmpty()
  houseId: string;

  @ApiProperty({ example: '64a1f2e9c...', description: 'Agent ID' })
  @IsString()
  @IsNotEmpty()
  agentId: string;

  @ApiProperty({ example: '2025-01-15', description: 'Scheduled date (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  scheduledDate: string;

  @ApiProperty({ example: '10:00 AM', description: 'Scheduled time' })
  @IsString()
  @IsNotEmpty()
  scheduledTime: string;

  @ApiProperty({ example: 'I would like to see the property', description: 'Optional notes', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: 'John Doe', description: 'Guest name (required if not logged in)', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'john@example.com', description: 'Guest email (required if not logged in)', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '+2348012345678', description: 'Guest phone (required if not logged in)', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: '64a1f2e9c...', description: 'User ID (if logged in)', required: false })
  @IsString()
  @IsOptional()
  userId?: string;
}

