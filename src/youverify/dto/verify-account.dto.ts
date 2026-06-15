import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class VerifyAccountDto {
  @IsIn(['nin', 'driver_license'])
  documentType: 'nin' | 'driver_license';

  @IsString()
  @MinLength(5)
  idNumber: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsBoolean()
  isSubjectConsent: boolean;
}
