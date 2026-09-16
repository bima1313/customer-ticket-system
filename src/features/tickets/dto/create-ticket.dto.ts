import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateTicketDto {
  @IsEmail()
  @IsNotEmpty()
  customerEmail: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
