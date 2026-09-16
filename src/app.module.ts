import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { TicketsModule } from './features/tickets/tickets.module.js';
import { LlmModule } from './features/llm/llm.module.js';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    TicketsModule,
    LlmModule,
  ],  
})
export class AppModule {}
