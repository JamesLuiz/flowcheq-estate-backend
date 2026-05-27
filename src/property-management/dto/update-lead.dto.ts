import { IsEnum } from 'class-validator';
import { PropertyLeadStatus } from '../schemas/property-lead.schema';

export class UpdateLeadDto {
  @IsEnum(PropertyLeadStatus)
  status: PropertyLeadStatus;
}
