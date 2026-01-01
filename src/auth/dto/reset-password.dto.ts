import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'a1b2c3d4-reset-token' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'newStrongPassword1', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

