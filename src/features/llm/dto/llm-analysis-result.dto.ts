import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export type TicketCategory = 'billing' | 'technical' | 'general';

export const VALID_CATEGORIES: TicketCategory[] = [
  'billing',
  'technical',
  'general',
];

export class LlmAnalysisResultDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_CATEGORIES, {
    message: `category harus salah satu dari: ${VALID_CATEGORIES.join(', ')}`,
  })
  category: TicketCategory;

  @IsString()
  @IsNotEmpty()
  suggestedReply: string;
}
