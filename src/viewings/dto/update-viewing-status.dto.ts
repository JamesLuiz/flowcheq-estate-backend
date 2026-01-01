import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateViewingStatusDto {
  @ApiProperty({ 
    example: 'confirmed', 
    description: 'Viewing status',
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['pending', 'confirmed', 'cancelled', 'completed'])
  status: string;
}

