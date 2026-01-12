import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateViewingStatusDto {
  @ApiProperty({ 
    example: 'confirmed', 
    description: 'Viewing status',
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'rescheduled'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['pending', 'confirmed', 'cancelled', 'completed', 'rescheduled'])
  status: string;

  @ApiProperty({ 
    description: 'New date for rescheduling (YYYY-MM-DD)',
    required: false,
  })
  @IsString()
  @IsOptional()
  newDate?: string;

  @ApiProperty({ 
    description: 'New time for rescheduling',
    required: false,
  })
  @IsString()
  @IsOptional()
  newTime?: string;
}

