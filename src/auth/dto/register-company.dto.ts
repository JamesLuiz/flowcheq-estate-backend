import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class CompanyDetailsDto {
  @ApiProperty({ example: 'ABC Real Estate Limited' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ example: 'RC123456' })
  @IsString()
  @IsNotEmpty()
  cacNumber: string;

  @ApiProperty({ example: 'info@abcrealestate.com' })
  @IsEmail()
  @IsNotEmpty()
  @Matches(/^(?!.*@(gmail|yahoo|outlook|hotmail|aol|mail|protonmail|icloud|live|msn|ymail|googlemail)\.).*$/, {
    message: 'Business email must use a company domain, not personal email providers',
  })
  businessEmail: string;

  @ApiProperty({ example: '+2341234567890' })
  @IsString()
  @IsNotEmpty()
  businessPhone: string;

  @ApiProperty({ example: '123 Business Street' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: 'https://abcrealestate.com', required: false })
  @IsString()
  @IsOptional()
  website?: string;

  @ApiProperty({ example: 2010, required: false })
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear())
  @IsOptional()
  @Type(() => Number)
  yearEstablished?: number;

  @ApiProperty({ example: '11-50', required: false })
  @IsString()
  @IsOptional()
  companySize?: string;
}

export class RegisterCompanyDto {
  @ApiProperty({ example: 'John Doe', description: 'Contact person name' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'john@abcrealestate.com', description: 'Login email (must be business email)' })
  @IsEmail()
  @Matches(/^(?!.*@(gmail|yahoo|outlook|hotmail|aol|mail|protonmail|icloud|live|msn|ymail|googlemail)\.).*$/, {
    message: 'Login email must use a company domain, not personal email providers',
  })
  email: string;

  @ApiProperty({ example: 'SecurePassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'Leading real estate company in Lagos', required: false })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiProperty({ type: CompanyDetailsDto })
  @ValidateNested()
  @Type(() => CompanyDetailsDto)
  companyDetails: CompanyDetailsDto;
}
