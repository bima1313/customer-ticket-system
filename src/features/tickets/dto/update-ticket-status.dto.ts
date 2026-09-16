import { IsEnum, IsNotEmpty } from 'class-validator';
import { Status } from '../../../generated/prisma/client.js';

export class UpdateTicketStatusDto {
  @IsEnum(Status)
  @IsNotEmpty()
  status: Status;
}
