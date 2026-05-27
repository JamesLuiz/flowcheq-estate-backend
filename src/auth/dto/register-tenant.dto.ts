import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @ApiProperty({ example: 'Tolu Ade' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'tolu@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'StrongPassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Looking for a 2-bed in Yaba', required: false })
  @IsOptional()
  @IsString()
  bio?: string;
}
