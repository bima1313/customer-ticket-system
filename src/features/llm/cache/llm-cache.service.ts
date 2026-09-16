import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { type Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.provider.js';
import type { LlmAnalysisResultDto } from '../dto/llm-analysis-result.dto.js';


/** TTL cache: 24 jam dalam detik */
const CACHE_TTL_SECONDS = 86_400;

@Injectable()
export class LlmCacheService {
  private readonly logger = new Logger(LlmCacheService.name);

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  /**
   * Membuat cache key unik dari subject dan message.
   * Dinormalisasi (lowercase + trim) sebelum di-hash agar input identik
   * yang berbeda hanya di kapitalisasi/spasi tetap menghasilkan cache hit.
   */
  buildCacheKey(subject: string, message: string): string {
    const normalized = `${subject.toLowerCase().trim()}::${message.toLowerCase().trim()}`;
    const hash = createHash('sha256').update(normalized).digest('hex');
    return `llm:ticket:${hash}`;
  }

  /** Ambil hasil LLM dari cache. Kembalikan null jika tidak ada atau Redis tidak tersedia. */
  async get(subject: string, message: string): Promise<LlmAnalysisResultDto | null> {
    if (!this.redis) return null;

    try {
      const key = this.buildCacheKey(subject, message);
      const cached = await this.redis.get(key);
      if (!cached) return null;

      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as LlmAnalysisResultDto;
    } catch (err) {
      this.logger.warn(`Redis GET error: ${(err as Error).message}`);
      return null;
    }
  }

  /** Simpan hasil LLM ke cache dengan TTL 24 jam. No-op jika Redis tidak tersedia. */
  async set(
    subject: string,
    message: string,
    result: LlmAnalysisResultDto,
  ): Promise<void> {
    if (!this.redis) return;

    try {
      const key = this.buildCacheKey(subject, message);
      await this.redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
      this.logger.debug(`Cache set: ${key}`);
    } catch (err) {
      this.logger.warn(`Redis SET error: ${(err as Error).message}`);
    }
  }
}
