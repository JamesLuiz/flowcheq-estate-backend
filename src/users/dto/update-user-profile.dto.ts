import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateUserProfileDto {
  @ApiProperty({ example: 'Tolu Ade', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: '+2348011112222', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Product Designer', required: false })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiProperty({ example: 'Nestin Labs', required: false })
  @IsOptional()
  @IsString()
  employer?: string;

  @ApiProperty({ example: 350000, required: false })
  @IsOptional()
  @IsNumber()
  monthlyIncome?: number;

  @ApiProperty({ example: 'Jane Doe', required: false })
  @IsOptional()
  @IsString()
  guarantorName?: string;

  @ApiProperty({ example: '+2348099988877', required: false })
  @IsOptional()
  @IsString()
  guarantorPhone?: string;

  @ApiProperty({ example: 'Sister', required: false })
  @IsOptional()
  @IsString()
  guarantorRelationship?: string;
}
