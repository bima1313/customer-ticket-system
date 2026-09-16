import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { TicketsController } from './tickets.controller.js';
import { LlmModule } from '../llm/llm.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [LlmModule, AuthModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
