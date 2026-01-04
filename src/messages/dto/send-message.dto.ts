import { IsString, IsNotEmpty, IsOptional, MaxLength, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ description: 'Receiver user ID' })
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @ApiProperty({ description: 'Message content', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @ApiProperty({ description: 'Optional property ID for context', required: false })
  @IsString()
  @IsOptional()
  houseId?: string;

  @ApiProperty({ 
    description: 'Conversation type', 
    enum: ['tenant-agent', 'co-tenant'],
    default: 'tenant-agent',
    required: false 
  })
  @IsString()
  @IsOptional()
  @IsIn(['tenant-agent', 'co-tenant'])
  conversationType?: 'tenant-agent' | 'co-tenant';
}
