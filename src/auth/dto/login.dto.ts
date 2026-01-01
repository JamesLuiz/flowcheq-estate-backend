import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'jameseliezer116@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '09093117933Luiz', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

