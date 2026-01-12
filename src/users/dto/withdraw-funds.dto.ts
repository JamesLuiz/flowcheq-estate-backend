import { IsNumber, IsString, Min, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class WithdrawFundsDto {
  @ApiProperty({
    example: 1000,
    description: 'Amount to withdraw (minimum 100 NGN)',
    minimum: 100,
  })
  @IsNumber()
  @Min(100)
  @Type(() => Number)
  amount: number;

  @ApiProperty({
    example: '123456',
    description: '6-digit transaction PIN',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'Transaction PIN must be exactly 6 digits' })
  transactionPin: string;

  @ApiProperty({
    example: 'A1B2C3',
    description: '6-character alphanumeric OTP sent to email',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^[A-Z0-9]{6}$/i, { message: 'OTP must be exactly 6 alphanumeric characters' })
  otp: string;
}

