import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterFieldVerifierDto {
  @ApiProperty({ example: 'Verification Officer' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'verifier@houseme.ng' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+2348011122233' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'StrongPassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
