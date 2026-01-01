import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'jameseliezer116@gmail.com' })
  @IsEmail()
  email: string;
}

