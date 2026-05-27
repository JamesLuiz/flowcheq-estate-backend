import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterLandlordDto {
  @ApiProperty({ example: 'Femi Adebayo' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'femi@landlordmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+2348099988877' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'StrongPassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '22446688990', description: 'Encrypted at rest', required: false })
  @IsOptional()
  @IsString()
  bvn?: string;

  @ApiProperty({ example: 'CM11223344556', description: 'Encrypted at rest' })
  @IsString()
  nin: string;

  @ApiProperty({ example: 'Owns apartments in Abuja', required: false })
  @IsOptional()
  @IsString()
  bio?: string;
}
