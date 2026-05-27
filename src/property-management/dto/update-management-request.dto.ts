import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ManagementRequestStatus } from '../schemas/management-request.schema';

export class UpdateManagementRequestDto {
  @IsEnum(ManagementRequestStatus)
  status: ManagementRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  responseNote?: string;
}
