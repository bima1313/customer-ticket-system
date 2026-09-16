import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Status } from '../../../generated/prisma/client.js';

export class GetTicketsQueryDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsString()
  category?: string;
}
