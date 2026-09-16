import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { ConfigService } from '@nestjs/config';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider = {
  provide: REDIS_CLIENT,
  inject: ['ConfigService'],
  useFactory: (configService: ConfigService): Redis | null => {
    const logger = new Logger('RedisProvider');
    const redisUrl = configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      logger.warn(
        'REDIS_URL tidak diset. Redis caching dinonaktifkan (graceful degrade).',
      );
      return null;
    }

    const client = new Redis(redisUrl, {
      // Jangan reconnect selamanya bila Redis tidak tersedia saat startup
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    client.on('error', (err: Error) => {
      logger.warn(`Redis error: ${err.message}`);
    });

    client.on('connect', () => {
      logger.log('Terhubung ke Redis.');
    });

    // Coba connect sekali; jika gagal, provider tetap return client (graceful degrade)
    client.connect().catch((err: Error) => {
      logger.warn(
        `Gagal terhubung ke Redis: ${err.message}. Cache dinonaktifkan sementara.`,
      );
    });

    return client;
  },
};
