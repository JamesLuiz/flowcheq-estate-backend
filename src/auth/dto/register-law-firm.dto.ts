import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class LawFirmDetailsDto {
  @ApiProperty({ example: 'Flowcheq Legal Partners LLP' })
  @IsString()
  @IsNotEmpty()
  firmName: string;

  @ApiProperty({ example: 'NBA/ABJ/12345', description: 'NBA or bar registration number' })
  @IsString()
  @IsNotEmpty()
  barRegistrationNumber: string;

  @ApiProperty({ example: 'legal@flowcheq.com' })
  @IsEmail()
  @IsNotEmpty()
  @Matches(/^(?!.*@(gmail|yahoo|outlook|hotmail|aol|mail|protonmail|icloud|live|msn|ymail|googlemail)\.).*$/, {
    message: 'Firm email must use a professional domain, not personal email providers',
  })
  businessEmail: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @IsNotEmpty()
  businessPhone: string;

  @ApiProperty({ example: '12 Legal Avenue' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'Abuja' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'FCT' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: 'https://flowcheq.com/legal', required: false })
  @IsString()
  @IsOptional()
  website?: string;
}

export class RegisterLawFirmDto {
  @ApiProperty({ example: 'Ada Okafor', description: 'Lead partner / contact name' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'partner@flowcheq.com' })
  @IsEmail()
  @Matches(/^(?!.*@(gmail|yahoo|outlook|hotmail|aol|mail|protonmail|icloud|live|msn|ymail|googlemail)\.).*$/, {
    message: 'Login email must use a firm domain, not personal email providers',
  })
  email: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiProperty({ type: LawFirmDetailsDto })
  @ValidateNested()
  @Type(() => LawFirmDetailsDto)
  lawFirmDetails: LawFirmDetailsDto;
}
