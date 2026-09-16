import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';

@Module({
  providers: [ApiKeyGuard],
  exports: [ApiKeyGuard],
})
export class AuthModule {}
