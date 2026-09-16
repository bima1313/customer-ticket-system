import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service.js';
import { LlmCacheService } from './cache/llm-cache.service.js';
import { RedisProvider, REDIS_CLIENT } from './cache/redis.provider.js';

@Module({
  imports: [ConfigModule],
  providers: [
    // Inject ConfigService ke dalam RedisProvider factory
    { ...RedisProvider, inject: [ConfigService] },
    LlmCacheService,
    LlmService,
  ],
  exports: [LlmService, REDIS_CLIENT],
})
export class LlmModule {}
